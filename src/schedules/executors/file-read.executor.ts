import { BadRequestException, Injectable } from '@nestjs/common';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Prisma, TaskType } from 'generated/prisma/client';
import { TaskExecutionResult, TaskExecutor } from './task-executor.interface';

@Injectable()
export class FileReadExecutor implements TaskExecutor {
  readonly type = TaskType.FILE_READ;

  async execute(payload: Prisma.JsonValue): Promise<TaskExecutionResult> {
    if (!this.isJsonObject(payload)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_READ_PAYLOAD',
        message: 'FILE_READ payload must be an object.',
      });
    }

    const path = payload.path;

    if (typeof path !== 'string' || path.trim().length === 0) {
      throw new BadRequestException({
        code: 'INVALID_FILE_READ_PAYLOAD',
        message: 'FILE_READ payload requires non-empty string: path.',
      });
    }

    const resolvedPath = resolve(process.cwd(), path);
    const fileStat = await stat(resolvedPath);
    const content = await readFile(resolvedPath, 'utf8');

    return {
      path,
      resolvedPath,
      sizeBytes: fileStat.size,
      lineCount: content.split(/\r?\n/).filter(Boolean).length,
      preview: content.slice(0, 200),
      readAt: new Date().toISOString(),
    };
  }

  private isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
