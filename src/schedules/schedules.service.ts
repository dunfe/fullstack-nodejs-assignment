import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
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
import { CronTime } from 'cron';

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

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
    let nextRunAt: Date | null = null;
    if (dto.scheduleAt) {
      nextRunAt = new Date(dto.scheduleAt);
    } else if (dto.cronExpr) {
      try {
        const cronTime = new CronTime(dto.cronExpr);
        nextRunAt = cronTime.sendAt().toJSDate();
      } catch (error) {
        throw new BadRequestException({
          code: 'INVALID_CRON_EXPRESSION',
          message: `Invalid cron expression: ${this.getErrorMessage(error)}`,
        });
      }
    }

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

    if (dto.cronExpr) {
      try {
        new CronTime(dto.cronExpr);
      } catch (error) {
        throw new BadRequestException({
          code: 'INVALID_CRON_EXPRESSION',
          message: `cronExpr must be a valid cron expression. Error: ${this.getErrorMessage(error)}`,
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
      attemptNumber: (task.runs?.length ?? 0) + 1,
    });

    try {
      const executor = this.taskExecutorRegistry.getExecutor(task.type);

      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(`Task execution timed out after ${task.timeoutMs}ms`),
          );
        }, task.timeoutMs);
      });

      // Introduce a small delay to make the RUNNING status visible to clients / UI in production/dev
      if (process.env.NODE_ENV !== 'test') {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      const executionResult = await Promise.race([
        executor.execute(task.payload),
        timeoutPromise,
      ]).finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });

      const result = this.toPrismaJsonObject({
        taskType: task.type,
        executedAt: new Date().toISOString(),
        correlationId,
        output: executionResult,
      });

      const finishedAt = new Date();

      await this.schedulesRepository.markRunSuccess(run.id, finishedAt, result);

      if (task.scheduleKind === ScheduleKind.CRON && task.cronExpr) {
        const cronTime = new CronTime(task.cronExpr);
        const nextRunAt = cronTime.sendAt().toJSDate();
        await this.schedulesRepository.rescheduleCronTask(
          task.id,
          nextRunAt,
          result,
        );

        return {
          skipped: false,
          taskId: task.id,
          runId: run.id,
          correlationId,
          status: TaskStatus.PENDING,
          nextRunAt,
        };
      }

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

      if (task.scheduleKind === ScheduleKind.CRON && task.cronExpr) {
        const cronTime = new CronTime(task.cronExpr);
        const nextRunAt = cronTime.sendAt().toJSDate();
        await this.schedulesRepository.rescheduleCronTask(
          task.id,
          nextRunAt,
          undefined,
          errorMessage,
        );

        return {
          skipped: false,
          taskId: task.id,
          runId: run.id,
          correlationId,
          status: TaskStatus.PENDING,
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

  async recoverStuckTasks(): Promise<void> {
    const now = new Date();
    const stuckTasks = await this.schedulesRepository.findStuckTasks(now);

    if (stuckTasks.length > 0) {
      this.logger.log(
        `[recovery] Found ${stuckTasks.length} stuck task(s) to recover`,
      );
    }

    for (const task of stuckTasks) {
      try {
        this.logger.warn(
          `[recovery] Recovering stuck task ${task.id} (lastRunAt: ${task.lastRunAt?.toISOString()})`,
        );

        const errorMessage =
          'Task execution timed out (unresponsive runner or system crash recovery).';
        const finishedAt = new Date();

        // Find the active running run log for this task
        const runningRun = task.runs.find(
          (r) => r.status === TaskStatus.RUNNING,
        );
        const correlationId = runningRun?.correlationId ?? randomUUID();

        const errorResult = this.toPrismaJsonObject({
          taskType: task.type,
          executedAt: finishedAt.toISOString(),
          correlationId,
          error: errorMessage,
        });

        if (runningRun) {
          await this.schedulesRepository.markRunFailed(
            runningRun.id,
            finishedAt,
            errorMessage,
            errorResult,
          );
        }

        const shouldRetry = task.attemptCount <= task.maxRetries;

        if (shouldRetry) {
          const nextRunAt = this.getNextRetryAt(task.retryDelaySeconds);

          await this.schedulesRepository.markTaskRetrying(
            task.id,
            nextRunAt,
            errorMessage,
          );

          this.logger.log(
            `[recovery] Rescheduled stuck task ${task.id} for retry at ${nextRunAt.toISOString()}`,
          );
        } else if (task.scheduleKind === ScheduleKind.CRON && task.cronExpr) {
          const cronTime = new CronTime(task.cronExpr);
          const nextRunAt = cronTime.sendAt().toJSDate();
          await this.schedulesRepository.rescheduleCronTask(
            task.id,
            nextRunAt,
            undefined,
            errorMessage,
          );

          this.logger.log(
            `[recovery] Stuck CRON task ${task.id} exceeded max retries, rescheduled for next cron tick at ${nextRunAt.toISOString()}`,
          );
        } else {
          await this.schedulesRepository.markTaskFailed(task.id, errorMessage);
          this.logger.error(
            `[recovery] Stuck task ${task.id} exceeded max retries and was marked failed`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.stack : String(error);
        this.logger.error(
          `[recovery] Failed to recover stuck task ${task.id}`,
          message,
        );
      }
    }
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
