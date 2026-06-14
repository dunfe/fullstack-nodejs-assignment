import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { PushScheduleDto } from './dto/push-schedule.dto';
import { SchedulesService } from './schedules.service';

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Post()
  create(@Body() dto: CreateScheduleDto) {
    return this.schedulesService.create(dto);
  }

  @Post('push')
  push(@Body() dto: PushScheduleDto) {
    return this.schedulesService.push(dto);
  }

  @Get()
  findMany() {
    return this.schedulesService.findMany();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.schedulesService.findById(id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.schedulesService.cancel(id);
  }
}
