export type TaskType = 'FILE_READ' | 'FILE_IMPORT' | 'FORM_FILL' | 'EMAIL';

export type TaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'RETRYING'
  | 'CANCELED'
  | 'PAUSED';

export type ScheduleKind = 'ONCE' | 'CRON';

export interface TaskRun {
  id: string;
  taskId: string;
  status: TaskStatus;
  correlationId: string;
  scheduledFor: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  attemptNumber: number;
  result: Record<string, any> | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ScheduleTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  scheduleKind: ScheduleKind;
  payload: Record<string, any>;
  result: Record<string, any> | null;
  scheduleAt: string | null;
  cronExpr: string | null;
  nextRunAt: string | null;
  idempotencyKey: string | null;
  maxRetries: number;
  attemptCount: number;
  timeoutMs: number;
  retryDelaySeconds: number;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  runs?: TaskRun[];
}

export interface CreateScheduleDto {
  type: TaskType;
  payload: Record<string, any>;
  scheduleAt?: string;
  cronExpr?: string;
  idempotencyKey?: string;
  maxRetries?: number;
  timeoutMs?: number;
  retryDelaySeconds?: number;
}

export interface PushScheduleDto {
  type: TaskType;
  payload: Record<string, any>;
  scheduleAt?: string;
  cronExpr?: string;
  idempotencyKey: string;
  maxRetries?: number;
  timeoutMs?: number;
  retryDelaySeconds?: number;
}
