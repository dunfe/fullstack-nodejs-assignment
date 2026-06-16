import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SchedulesRepository } from '../schedules.repository';
import { SchedulesService } from '../schedules.service';

@Injectable()
export class SchedulerScannerService {
  private readonly logger = new Logger(SchedulerScannerService.name);

  constructor(
    private readonly schedulesRepository: SchedulesRepository,
    private readonly schedulesService: SchedulesService,
  ) {
    this.logger.log('SchedulerScannerService initialized');
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async scanDueTasks() {
    const now = new Date();

    this.logger.log(`[scheduler] tick at ${now.toISOString()}`);

    try {
      await this.schedulesService.recoverStuckTasks();
    } catch (error) {
      const message = error instanceof Error ? error.stack : String(error);
      this.logger.error(`[scheduler] failed to recover stuck tasks`, message);
    }

    const dueTasks = await this.schedulesRepository.findDueTasks(now, 10);

    this.logger.log(`[scheduler] found ${dueTasks.length} due task(s)`);

    for (const task of dueTasks) {
      try {
        this.logger.log(`[scheduler] processing task ${task.id}`);

        const result = await this.schedulesService.processDueTask(task.id);

        if (result.skipped) {
          this.logger.warn(
            `[scheduler] skipped task ${task.id}: ${result.reason}`,
          );
          continue;
        }

        this.logger.log(
          `[scheduler] processed task ${result.taskId}, run ${result.runId}, correlationId ${result.correlationId}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.stack : String(error);
        this.logger.error(
          `[scheduler] failed to process task ${task.id}`,
          message,
        );
      }
    }
  }
}
