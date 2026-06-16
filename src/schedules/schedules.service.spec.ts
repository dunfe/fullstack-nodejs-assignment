/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesService } from './schedules.service';
import { SchedulesRepository } from './schedules.repository';
import { TaskPayloadValidator } from './validators/task-payload.validator';
import { TaskExecutorRegistry } from './executors/task-executor.registry';
import { TaskStatus, TaskType, ScheduleKind } from 'generated/prisma/enums';

describe('SchedulesService - Timeout and Recovery Handling', () => {
  let service: SchedulesService;
  let repository: jest.Mocked<SchedulesRepository>;
  let registry: jest.Mocked<TaskExecutorRegistry>;

  beforeEach(async () => {
    const repositoryMock = {
      findById: jest.fn(),
      claimDueTask: jest.fn(),
      createRunLog: jest.fn(),
      markRunSuccess: jest.fn(),
      markTaskSuccess: jest.fn(),
      markRunFailed: jest.fn(),
      markTaskRetrying: jest.fn(),
      markTaskFailed: jest.fn(),
      findStuckTasks: jest.fn(),
      rescheduleCronTask: jest.fn(),
    };

    const registryMock = {
      getExecutor: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        {
          provide: SchedulesRepository,
          useValue: repositoryMock,
        },
        {
          provide: TaskPayloadValidator,
          useValue: {},
        },
        {
          provide: TaskExecutorRegistry,
          useValue: registryMock,
        },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
    repository = module.get(SchedulesRepository);
    registry = module.get(TaskExecutorRegistry);
  });

  describe('processDueTask - Timeout Handling', () => {
    it('should successfully execute a task within the timeout limit', async () => {
      const taskId = 'task-success-id';
      const mockTask = {
        id: taskId,
        type: TaskType.FILE_READ,
        status: TaskStatus.RUNNING,
        scheduleKind: ScheduleKind.ONCE,
        payload: { path: 'test.txt' },
        timeoutMs: 100,
        attemptCount: 1,
        maxRetries: 3,
        retryDelaySeconds: 10,
        nextRunAt: new Date(),
        lastRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        cronExpr: null,
        scheduleAt: null,
        idempotencyKey: null,
        lastError: null,
        result: null,
      };

      const mockRunLog = {
        id: 'run-id-1',
        taskId,
        status: TaskStatus.RUNNING,
        correlationId: 'test-correlation-id',
        scheduledFor: null,
        startedAt: new Date(),
        finishedAt: null,
        attemptNumber: 1,
        result: null,
        errorMessage: null,
        createdAt: new Date(),
      };

      repository.claimDueTask.mockResolvedValue({ count: 1 });
      repository.findById.mockResolvedValue(mockTask as any);
      repository.createRunLog.mockResolvedValue(mockRunLog);

      const mockExecutor = {
        type: TaskType.FILE_READ,
        execute: jest.fn().mockImplementation(async () => {
          // Finish quickly within 10ms (timeout is 100ms)
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { content: 'hello' };
        }),
      };
      registry.getExecutor.mockReturnValue(mockExecutor);

      const result = await service.processDueTask(taskId);

      expect(result.skipped).toBe(false);
      expect(result.status).toBe(TaskStatus.SUCCESS);
      expect(mockExecutor.execute).toHaveBeenCalledWith(mockTask.payload);
      expect(repository.markRunSuccess).toHaveBeenCalled();
      expect(repository.markTaskSuccess).toHaveBeenCalled();
      expect(repository.markRunFailed).not.toHaveBeenCalled();
    });

    it('should time out and trigger retry when task execution exceeds timeoutMs', async () => {
      const taskId = 'task-timeout-retry-id';
      const mockTask = {
        id: taskId,
        type: TaskType.FILE_READ,
        status: TaskStatus.RUNNING,
        scheduleKind: ScheduleKind.ONCE,
        payload: { path: 'test.txt' },
        timeoutMs: 50,
        attemptCount: 1,
        maxRetries: 3,
        retryDelaySeconds: 10,
        nextRunAt: new Date(),
        lastRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        cronExpr: null,
        scheduleAt: null,
        idempotencyKey: null,
        lastError: null,
        result: null,
      };

      const mockRunLog = {
        id: 'run-id-2',
        taskId,
        status: TaskStatus.RUNNING,
        correlationId: 'test-correlation-id',
        scheduledFor: null,
        startedAt: new Date(),
        finishedAt: null,
        attemptNumber: 1,
        result: null,
        errorMessage: null,
        createdAt: new Date(),
      };

      repository.claimDueTask.mockResolvedValue({ count: 1 });
      repository.findById.mockResolvedValue(mockTask as any);
      repository.createRunLog.mockResolvedValue(mockRunLog);

      const mockExecutor = {
        type: TaskType.FILE_READ,
        execute: jest.fn().mockImplementation(async () => {
          // Delay longer than 50ms timeout
          await new Promise((resolve) => setTimeout(resolve, 150));
          return { content: 'hello' };
        }),
      };
      registry.getExecutor.mockReturnValue(mockExecutor);

      const result = await service.processDueTask(taskId);

      expect(result.skipped).toBe(false);
      expect(result.status).toBe(TaskStatus.RETRYING);
      expect(result.error).toContain('Task execution timed out after 50ms');
      expect(repository.markRunFailed).toHaveBeenCalledWith(
        'run-id-2',
        expect.any(Date),
        expect.stringContaining('Task execution timed out after 50ms'),
        expect.any(Object),
      );
      expect(repository.markTaskRetrying).toHaveBeenCalledWith(
        taskId,
        expect.any(Date),
        expect.stringContaining('Task execution timed out after 50ms'),
      );
    });

    it('should time out and fail completely if maxRetries is exceeded', async () => {
      const taskId = 'task-timeout-fail-id';
      const mockTask = {
        id: taskId,
        type: TaskType.FILE_READ,
        status: TaskStatus.RUNNING,
        scheduleKind: ScheduleKind.ONCE,
        payload: { path: 'test.txt' },
        timeoutMs: 30,
        attemptCount: 4, // Exceeds maxRetries of 3
        maxRetries: 3,
        retryDelaySeconds: 10,
        nextRunAt: new Date(),
        lastRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        cronExpr: null,
        scheduleAt: null,
        idempotencyKey: null,
        lastError: null,
        result: null,
      };

      const mockRunLog = {
        id: 'run-id-3',
        taskId,
        status: TaskStatus.RUNNING,
        correlationId: 'test-correlation-id',
        scheduledFor: null,
        startedAt: new Date(),
        finishedAt: null,
        attemptNumber: 4,
        result: null,
        errorMessage: null,
        createdAt: new Date(),
      };

      repository.claimDueTask.mockResolvedValue({ count: 1 });
      repository.findById.mockResolvedValue(mockTask as any);
      repository.createRunLog.mockResolvedValue(mockRunLog);

      const mockExecutor = {
        type: TaskType.FILE_READ,
        execute: jest.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { content: 'hello' };
        }),
      };
      registry.getExecutor.mockReturnValue(mockExecutor);

      const result = await service.processDueTask(taskId);

      expect(result.skipped).toBe(false);
      expect(result.status).toBe(TaskStatus.FAILED);
      expect(result.error).toContain('Task execution timed out after 30ms');
      expect(repository.markRunFailed).toHaveBeenCalled();
      expect(repository.markTaskFailed).toHaveBeenCalledWith(
        taskId,
        expect.stringContaining('Task execution timed out after 30ms'),
      );
      expect(repository.markTaskRetrying).not.toHaveBeenCalled();
    });
  });

  describe('processDueTask - CRON Tasks', () => {
    it('should successfully execute a CRON task and schedule its next run', async () => {
      const taskId = 'cron-task-success-id';
      const mockTask = {
        id: taskId,
        type: TaskType.FILE_READ,
        status: TaskStatus.RUNNING,
        scheduleKind: ScheduleKind.CRON,
        payload: { path: 'test.txt' },
        timeoutMs: 1000,
        attemptCount: 1,
        maxRetries: 3,
        retryDelaySeconds: 10,
        nextRunAt: new Date(),
        lastRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        cronExpr: '*/5 * * * * *',
        scheduleAt: null,
        idempotencyKey: null,
        lastError: null,
        result: null,
      };

      const mockRunLog = {
        id: 'run-id-cron-1',
        taskId,
        status: TaskStatus.RUNNING,
        correlationId: 'test-correlation-id',
        scheduledFor: null,
        startedAt: new Date(),
        finishedAt: null,
        attemptNumber: 1,
        result: null,
        errorMessage: null,
        createdAt: new Date(),
      };

      repository.claimDueTask.mockResolvedValue({ count: 1 });
      repository.findById.mockResolvedValue(mockTask as any);
      repository.createRunLog.mockResolvedValue(mockRunLog);

      const mockExecutor = {
        type: TaskType.FILE_READ,
        execute: jest.fn().mockResolvedValue({ content: 'cron data' }),
      };
      registry.getExecutor.mockReturnValue(mockExecutor);

      const result = await service.processDueTask(taskId);

      expect(result.skipped).toBe(false);
      expect(result.status).toBe(TaskStatus.PENDING);
      expect(result.nextRunAt).toBeInstanceOf(Date);
      expect(mockExecutor.execute).toHaveBeenCalledWith(mockTask.payload);
      expect(repository.markRunSuccess).toHaveBeenCalled();
      expect(repository.rescheduleCronTask).toHaveBeenCalledWith(
        taskId,
        expect.any(Date),
        expect.any(Object),
      );
      expect(repository.markTaskSuccess).not.toHaveBeenCalled();
    });

    it('should fail executing a CRON task, retry until exhausted, then reschedule for next cron run', async () => {
      const taskId = 'cron-task-fail-id';
      const mockTask = {
        id: taskId,
        type: TaskType.FILE_READ,
        status: TaskStatus.RUNNING,
        scheduleKind: ScheduleKind.CRON,
        payload: { path: 'test.txt' },
        timeoutMs: 1000,
        attemptCount: 4, // exceeds maxRetries of 3
        maxRetries: 3,
        retryDelaySeconds: 10,
        nextRunAt: new Date(),
        lastRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        cronExpr: '*/5 * * * * *',
        scheduleAt: null,
        idempotencyKey: null,
        lastError: null,
        result: null,
      };

      const mockRunLog = {
        id: 'run-id-cron-2',
        taskId,
        status: TaskStatus.RUNNING,
        correlationId: 'test-correlation-id',
        scheduledFor: null,
        startedAt: new Date(),
        finishedAt: null,
        attemptNumber: 4,
        result: null,
        errorMessage: null,
        createdAt: new Date(),
      };

      repository.claimDueTask.mockResolvedValue({ count: 1 });
      repository.findById.mockResolvedValue(mockTask as any);
      repository.createRunLog.mockResolvedValue(mockRunLog);

      const mockExecutor = {
        type: TaskType.FILE_READ,
        execute: jest.fn().mockRejectedValue(new Error('connection failed')),
      };
      registry.getExecutor.mockReturnValue(mockExecutor);

      const result = await service.processDueTask(taskId);

      expect(result.skipped).toBe(false);
      expect(result.status).toBe(TaskStatus.PENDING);
      expect(result.nextRunAt).toBeInstanceOf(Date);
      expect(result.error).toBe('connection failed');
      expect(repository.markRunFailed).toHaveBeenCalled();
      expect(repository.rescheduleCronTask).toHaveBeenCalledWith(
        taskId,
        expect.any(Date),
        undefined,
        'connection failed',
      );
      expect(repository.markTaskFailed).not.toHaveBeenCalled();
    });
  });

  describe('recoverStuckTasks', () => {
    it('should find stuck tasks, fail their active running logs, and reschedule for retry', async () => {
      const stuckTask = {
        id: 'stuck-task-retry',
        type: TaskType.FILE_READ,
        status: TaskStatus.RUNNING,
        attemptCount: 1,
        maxRetries: 3,
        retryDelaySeconds: 15,
        lastRunAt: new Date(Date.now() - 60000), // ran 60s ago
        timeoutMs: 30000, // timeout was 30s
        runs: [
          {
            id: 'stuck-run-id',
            status: TaskStatus.RUNNING,
            correlationId: 'correlation-abc',
          },
        ],
      };

      repository.findStuckTasks.mockResolvedValue([stuckTask as any]);

      await service.recoverStuckTasks();

      expect(repository.findStuckTasks).toHaveBeenCalled();
      expect(repository.markRunFailed).toHaveBeenCalledWith(
        'stuck-run-id',
        expect.any(Date),
        expect.stringContaining('unresponsive runner'),
        expect.any(Object),
      );
      expect(repository.markTaskRetrying).toHaveBeenCalledWith(
        'stuck-task-retry',
        expect.any(Date),
        expect.stringContaining('unresponsive runner'),
      );
      expect(repository.markTaskFailed).not.toHaveBeenCalled();
    });

    it('should find stuck tasks, fail their active running logs, and fail task if maxRetries exceeded', async () => {
      const stuckTask = {
        id: 'stuck-task-fail',
        type: TaskType.FILE_READ,
        status: TaskStatus.RUNNING,
        attemptCount: 3, // Exceeds maxRetries
        maxRetries: 2,
        retryDelaySeconds: 15,
        lastRunAt: new Date(Date.now() - 60000), // ran 60s ago
        timeoutMs: 30000, // timeout was 30s
        runs: [
          {
            id: 'stuck-run-id-fail',
            status: TaskStatus.RUNNING,
            correlationId: 'correlation-xyz',
          },
        ],
      };

      repository.findStuckTasks.mockResolvedValue([stuckTask as any]);

      await service.recoverStuckTasks();

      expect(repository.findStuckTasks).toHaveBeenCalled();
      expect(repository.markRunFailed).toHaveBeenCalledWith(
        'stuck-run-id-fail',
        expect.any(Date),
        expect.stringContaining('unresponsive runner'),
        expect.any(Object),
      );
      expect(repository.markTaskFailed).toHaveBeenCalledWith(
        'stuck-task-fail',
        expect.stringContaining('unresponsive runner'),
      );
      expect(repository.markTaskRetrying).not.toHaveBeenCalled();
    });
  });
});
