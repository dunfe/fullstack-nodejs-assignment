import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { TaskType } from 'generated/prisma/enums';

type ScheduleTimingFields = {
  scheduleAt?: string;
  cronExpr?: string;
};

export class CreateScheduleDto {
  @IsEnum(TaskType)
  type!: TaskType;

  @IsObject()
  @IsNotEmpty()
  payload!: Record<string, unknown>;

  @ValidateIf((dto: ScheduleTimingFields) => !dto.cronExpr)
  @IsISO8601()
  scheduleAt?: string;

  @ValidateIf((dto: ScheduleTimingFields) => !dto.scheduleAt)
  @IsString()
  cronExpr?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(300000)
  timeoutMs?: number;
}
