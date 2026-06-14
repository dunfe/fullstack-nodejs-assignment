import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskType } from 'generated/prisma/client';
import { FileReadExecutor } from './file-read.executor';
import { TaskExecutor } from './task-executor.interface';

@Injectable()
export class TaskExecutorRegistry {
  private readonly executors = new Map<TaskType, TaskExecutor>();

  constructor(fileReadExecutor: FileReadExecutor) {
    this.executors.set(fileReadExecutor.type, fileReadExecutor);
  }

  getExecutor(type: TaskType): TaskExecutor {
    const executor = this.executors.get(type);

    if (!executor) {
      throw new NotFoundException({
        code: 'TASK_EXECUTOR_NOT_FOUND',
        message: `No executor registered for task type ${type}.`,
      });
    }

    return executor;
  }
}
