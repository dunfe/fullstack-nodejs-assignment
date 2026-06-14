import { Prisma, TaskType } from 'generated/prisma/client';

export type TaskExecutionResult = Prisma.InputJsonObject;

export interface TaskExecutor {
  readonly type: TaskType;

  execute(payload: Prisma.JsonValue): Promise<TaskExecutionResult>;
}
