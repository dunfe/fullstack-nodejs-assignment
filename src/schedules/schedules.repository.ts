import { Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from 'generated/prisma/client';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class SchedulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ScheduleTaskCreateInput) {
    return this.prisma.scheduleTask.create({ data });
  }

  findById(id: string) {
    return this.prisma.scheduleTask.findUnique({
      where: { id },
      include: {
        runs: {
          orderBy: {
            attemptNumber: 'asc',
          },
        },
      },
    });
  }

  findMany() {
    return this.prisma.scheduleTask.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.scheduleTask.findUnique({
      where: { idempotencyKey },
    });
  }

  cancelPendingTask(id: string) {
    return this.prisma.scheduleTask.updateMany({
      where: {
        id,
        status: {
          in: [TaskStatus.PENDING, TaskStatus.PAUSED, TaskStatus.RETRYING],
        },
      },
      data: {
        status: TaskStatus.CANCELED,
      },
    });
  }

  findDueTasks(now: Date, limit = 10) {
    return this.prisma.scheduleTask.findMany({
      where: {
        OR: [
          {
            status: TaskStatus.PENDING,
            OR: [
              {
                scheduleAt: {
                  lte: now,
                },
              },
              {
                nextRunAt: {
                  lte: now,
                },
              },
            ],
          },
          {
            status: TaskStatus.RETRYING,
            nextRunAt: {
              lte: now,
            },
          },
        ],
      },
      orderBy: {
        nextRunAt: 'asc',
      },
      take: limit,
    });
  }

  claimDueTask(id: string, now: Date) {
    return this.prisma.scheduleTask.updateMany({
      where: {
        id,
        status: {
          in: [TaskStatus.PENDING, TaskStatus.RETRYING],
        },
        OR: [
          {
            nextRunAt: {
              lte: now,
            },
          },
          {
            scheduleAt: {
              lte: now,
            },
          },
        ],
      },
      data: {
        status: TaskStatus.RUNNING,
        lastRunAt: now,
        attemptCount: {
          increment: 1,
        },
      },
    });
  }

  createRunLog(data: Prisma.TaskRunUncheckedCreateInput) {
    return this.prisma.taskRun.create({ data });
  }

  markRunSuccess(
    runId: string,
    finishedAt: Date,
    result: Prisma.InputJsonValue,
  ) {
    return this.prisma.taskRun.update({
      where: { id: runId },
      data: {
        status: TaskStatus.SUCCESS,
        finishedAt,
        result,
      },
    });
  }

  markTaskSuccess(taskId: string, result: Prisma.InputJsonValue) {
    return this.prisma.scheduleTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.SUCCESS,
        result,
        lastError: null,
      },
    });
  }

  rescheduleCronTask(
    taskId: string,
    nextRunAt: Date,
    result?: Prisma.InputJsonValue,
    errorMessage?: string,
  ) {
    return this.prisma.scheduleTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.PENDING,
        nextRunAt,
        attemptCount: 0,
        result: result !== undefined ? result : undefined,
        lastError: errorMessage !== undefined ? errorMessage : null,
      },
    });
  }

  async markRunFailed(
    runId: string,
    finishedAt: Date,
    errorMessage: string,
    result: Prisma.InputJsonObject,
  ) {
    return this.prisma.taskRun.update({
      where: { id: runId },
      data: {
        status: TaskStatus.FAILED,
        finishedAt,
        errorMessage,
        result,
      },
    });
  }

  async markTaskRetrying(
    taskId: string,
    nextRunAt: Date,
    errorMessage: string,
  ) {
    return this.prisma.scheduleTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.RETRYING,
        nextRunAt,
        lastError: errorMessage,
      },
    });
  }

  async markTaskFailed(taskId: string, errorMessage: string) {
    return this.prisma.scheduleTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.FAILED,
        nextRunAt: null,
        lastError: errorMessage,
      },
    });
  }

  async findStuckTasks(now: Date) {
    const runningTasks = await this.prisma.scheduleTask.findMany({
      where: {
        status: TaskStatus.RUNNING,
      },
      include: {
        runs: {
          orderBy: {
            attemptNumber: 'desc',
          },
        },
      },
    });

    return runningTasks.filter((task) => {
      if (!task.lastRunAt) return false;
      const runningLimit = task.lastRunAt.getTime() + task.timeoutMs;
      return runningLimit <= now.getTime();
    });
  }
}
