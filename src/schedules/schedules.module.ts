import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { SchedulesRepository } from './schedules.repository';

@Module({
  controllers: [SchedulesController],
  providers: [SchedulesService, SchedulesRepository],
})
export class SchedulesModule {}
