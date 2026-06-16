import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskType } from 'generated/prisma/client';
import { FileReadExecutor } from './file-read.executor';
import { FileImportExecutor } from './file-import.executor';
import { FormFillExecutor } from './form-fill.executor';
import { EmailExecutor } from './email.executor';
import { TaskExecutor } from './task-executor.interface';

@Injectable()
export class TaskExecutorRegistry {
  private readonly executors = new Map<TaskType, TaskExecutor>();

  constructor(
    fileReadExecutor: FileReadExecutor,
    fileImportExecutor: FileImportExecutor,
    formFillExecutor: FormFillExecutor,
    emailExecutor: EmailExecutor,
  ) {
    this.executors.set(fileReadExecutor.type, fileReadExecutor);
    this.executors.set(fileImportExecutor.type, fileImportExecutor);
    this.executors.set(formFillExecutor.type, formFillExecutor);
    this.executors.set(emailExecutor.type, emailExecutor);
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
