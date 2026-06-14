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
          orderBy: { createdAt: 'desc' },
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
}
