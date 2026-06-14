import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { SchedulesRepository } from './schedules.repository';
import { TaskPayloadValidator } from './validators/task-payload.validator';
import { SchedulerScannerService } from './scheduler/scheduler-scanner.service';
import { TaskExecutorRegistry } from './executors/task-executor.registry';
import { FileReadExecutor } from './executors/file-read.executor';

@Module({
  controllers: [SchedulesController],
  providers: [
    SchedulesService,
    SchedulesRepository,
    TaskPayloadValidator,
    SchedulerScannerService,
    FileReadExecutor,
    TaskExecutorRegistry,
  ],
})
export class SchedulesModule {}
