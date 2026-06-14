import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { PushScheduleDto } from './dto/push-schedule.dto';
import { SchedulesRepository } from './schedules.repository';
import { Prisma } from 'generated/prisma/client';
import { ScheduleKind, TaskStatus } from 'generated/prisma/enums';
import { TaskPayloadValidator } from './validators/task-payload.validator';
import { randomUUID } from 'crypto';
import { TaskExecutorRegistry } from './executors/task-executor.registry';

@Injectable()
export class SchedulesService {
  constructor(
    private readonly schedulesRepository: SchedulesRepository,
    private readonly taskPayloadValidator: TaskPayloadValidator,
    private readonly taskExecutorRegistry: TaskExecutorRegistry,
  ) {}

  async create(dto: CreateScheduleDto) {
    this.validateScheduleInput(dto);
    this.taskPayloadValidator.validate(dto.type, dto.payload);

    if (dto.idempotencyKey) {
      const existing = await this.schedulesRepository.findByIdempotencyKey(
        dto.idempotencyKey,
      );

      if (existing) {
        return existing;
      }
    }

    const scheduleKind = dto.scheduleAt ? ScheduleKind.ONCE : ScheduleKind.CRON;
    const nextRunAt = dto.scheduleAt ? new Date(dto.scheduleAt) : null;

    try {
      return await this.schedulesRepository.create({
        type: dto.type,
        status: TaskStatus.PENDING,
        scheduleKind,
        payload: dto.payload as Prisma.InputJsonValue,
        scheduleAt: dto.scheduleAt ? new Date(dto.scheduleAt) : null,
        cronExpr: dto.cronExpr ?? null,
        nextRunAt,
        idempotencyKey: dto.idempotencyKey ?? null,
        maxRetries: dto.maxRetries ?? 3,
        timeoutMs: dto.timeoutMs ?? 30000,
        retryDelaySeconds: dto.retryDelaySeconds ?? 30,
        retryCount: 0,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException({
          code: 'DUPLICATE_IDEMPOTENCY_KEY',
          message: 'A schedule task with this idempotencyKey already exists.',
        });
      }

      throw error;
    }
  }

  async push(dto: PushScheduleDto) {
    return this.create(dto);
  }

  async findMany() {
    return this.schedulesRepository.findMany();
  }

  async findById(id: string) {
    const task = await this.schedulesRepository.findById(id);

    if (!task) {
      throw new NotFoundException({
        code: 'SCHEDULE_TASK_NOT_FOUND',
        message: 'Schedule task not found.',
      });
    }

    return task;
  }

  private readonly cancelableStatuses: TaskStatus[] = [
    TaskStatus.PENDING,
    TaskStatus.PAUSED,
    TaskStatus.RETRYING,
  ];

  private isCancelableStatus(status: TaskStatus) {
    return this.cancelableStatuses.includes(status);
  }

  async cancel(id: string) {
    const task = await this.schedulesRepository.findById(id);

    if (!task) {
      throw new NotFoundException({
        code: 'SCHEDULE_TASK_NOT_FOUND',
        message: 'Schedule task not found.',
      });
    }

    if (!this.isCancelableStatus(task.status)) {
      throw new BadRequestException({
        code: 'SCHEDULE_TASK_CANNOT_BE_CANCELED',
        message: `Cannot cancel task with status ${task.status}.`,
      });
    }

    const result = await this.schedulesRepository.cancelPendingTask(id);

    if (result.count === 0) {
      throw new ConflictException({
        code: 'SCHEDULE_TASK_STATUS_CHANGED',
        message: 'Task status changed before it could be canceled.',
      });
    }

    return this.findById(id);
  }

  private validateScheduleInput(dto: CreateScheduleDto) {
    if (!dto.scheduleAt && !dto.cronExpr) {
      throw new BadRequestException({
        code: 'SCHEDULE_REQUIRED',
        message: 'Either scheduleAt or cronExpr is required.',
      });
    }

    if (dto.scheduleAt && dto.cronExpr) {
      throw new BadRequestException({
        code: 'ONLY_ONE_SCHEDULE_ALLOWED',
        message: 'Use either scheduleAt or cronExpr, not both.',
      });
    }

    if (dto.scheduleAt) {
      const scheduleDate = new Date(dto.scheduleAt);

      if (Number.isNaN(scheduleDate.getTime())) {
        throw new BadRequestException({
          code: 'INVALID_SCHEDULE_AT',
          message: 'scheduleAt must be a valid ISO date.',
        });
      }

      if (scheduleDate.getTime() <= Date.now()) {
        throw new BadRequestException({
          code: 'SCHEDULE_AT_MUST_BE_FUTURE',
          message: 'scheduleAt must be in the future.',
        });
      }
    }
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  async processDueTask(taskId: string) {
    const now = new Date();

    const claimResult = await this.schedulesRepository.claimDueTask(
      taskId,
      now,
    );

    if (claimResult.count === 0) {
      return {
        skipped: true,
        reason: 'Task was already claimed, canceled, or not due yet.',
      };
    }

    const task = await this.schedulesRepository.findById(taskId);

    if (!task) {
      return {
        skipped: true,
        reason: 'Task disappeared after claim.',
      };
    }

    const correlationId = randomUUID();

    const run = await this.schedulesRepository.createRunLog({
      taskId: task.id,
      status: TaskStatus.RUNNING,
      correlationId,
      scheduledFor: task.nextRunAt,
      startedAt: now,
      attemptNumber: task.attemptCount,
    });

    try {
      const executor = this.taskExecutorRegistry.getExecutor(task.type);

      const executionResult = await executor.execute(task.payload);

      const result = this.toPrismaJsonObject({
        taskType: task.type,
        executedAt: new Date().toISOString(),
        correlationId,
        output: executionResult,
      });

      const finishedAt = new Date();

      await this.schedulesRepository.markRunSuccess(run.id, finishedAt, result);

      await this.schedulesRepository.markTaskSuccess(task.id, result);

      return {
        skipped: false,
        taskId: task.id,
        runId: run.id,
        correlationId,
        status: TaskStatus.SUCCESS,
      };
    } catch (error: unknown) {
      const finishedAt = new Date();
      const errorMessage = this.getErrorMessage(error);

      const errorResult = this.toPrismaJsonObject({
        taskType: task.type,
        executedAt: finishedAt.toISOString(),
        correlationId,
        error: errorMessage,
      });

      await this.schedulesRepository.markRunFailed(
        run.id,
        finishedAt,
        errorMessage,
        errorResult,
      );

      const shouldRetry = task.attemptCount <= task.maxRetries;

      if (shouldRetry) {
        const nextRunAt = this.getNextRetryAt(task.retryDelaySeconds);

        await this.schedulesRepository.markTaskRetrying(
          task.id,
          nextRunAt,
          errorMessage,
        );

        return {
          skipped: false,
          taskId: task.id,
          runId: run.id,
          correlationId,
          status: TaskStatus.RETRYING,
          nextRunAt,
          error: errorMessage,
        };
      }

      await this.schedulesRepository.markTaskFailed(task.id, errorMessage);

      return {
        skipped: false,
        taskId: task.id,
        runId: run.id,
        correlationId,
        status: TaskStatus.FAILED,
        error: errorMessage,
      };
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private getNextRetryAt(retryDelaySeconds: number): Date {
    return new Date(Date.now() + retryDelaySeconds * 1000);
  }

  private toPrismaJsonObject(
    value: Record<string, unknown>,
  ): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
  }
}
