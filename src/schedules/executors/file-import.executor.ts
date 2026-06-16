import { BadRequestException, Injectable } from '@nestjs/common';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Prisma, TaskType } from 'generated/prisma/client';
import { TaskExecutionResult, TaskExecutor } from './task-executor.interface';

interface ImportSuccessFileResult {
  path: string;
  status: 'success';
  sizeBytes: number;
  parsedData: unknown;
  readAt: string;
}

interface ImportFailedFileResult {
  path: string;
  status: 'failed';
  error: string;
}

type ImportFileResult = ImportSuccessFileResult | ImportFailedFileResult;

@Injectable()
export class FileImportExecutor implements TaskExecutor {
  readonly type = TaskType.FILE_IMPORT;

  async execute(payload: Prisma.JsonValue): Promise<TaskExecutionResult> {
    if (!this.isJsonObject(payload)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_IMPORT_PAYLOAD',
        message: 'FILE_IMPORT payload must be an object.',
      });
    }

    const paths = payload.paths;

    if (!Array.isArray(paths)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_IMPORT_PAYLOAD',
        message: 'FILE_IMPORT payload requires an array: paths.',
      });
    }

    const filesResults: ImportFileResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const rawPath of paths) {
      if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
        failedCount++;
        filesResults.push({
          path:
            typeof rawPath === 'object' && rawPath !== null
              ? JSON.stringify(rawPath)
              : String(rawPath),
          status: 'failed',
          error: 'Path must be a non-empty string.',
        });
        continue;
      }

      const path = rawPath.trim();
      const resolvedPath = resolve(process.cwd(), path);

      try {
        const fileStat = await stat(resolvedPath);
        const content = await readFile(resolvedPath, 'utf8');
        let parsedData: unknown = null;

        // Try parsing based on extension
        const lowerPath = path.toLowerCase();
        if (lowerPath.endsWith('.json')) {
          try {
            parsedData = JSON.parse(content) as unknown;
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            throw new Error(`JSON parse error: ${errMsg}`);
          }
        } else if (lowerPath.endsWith('.csv')) {
          const lines = content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          if (lines.length > 0) {
            const headers = lines[0].split(',').map((h) => h.trim());
            parsedData = lines.slice(1).map((line) => {
              const cols = line.split(',').map((c) => c.trim());
              const rowData: Record<string, string> = {};
              headers.forEach((header, index) => {
                rowData[header] = cols[index] || '';
              });
              return rowData;
            });
          } else {
            parsedData = [];
          }
        } else {
          // Fallback parsing: try JSON first, then plain text lines
          try {
            parsedData = JSON.parse(content) as unknown;
          } catch {
            const lines = content
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean);
            parsedData = lines;
          }
        }

        successCount++;
        filesResults.push({
          path,
          status: 'success',
          sizeBytes: fileStat.size,
          parsedData,
          readAt: new Date().toISOString(),
        });
      } catch (err: unknown) {
        failedCount++;
        const errMsg = err instanceof Error ? err.message : String(err);
        filesResults.push({
          path,
          status: 'failed',
          error: errMsg,
        });
      }
    }

    // Convert fileResults to fit Prisma.InputJsonObject type
    return {
      totalFiles: paths.length,
      successCount,
      failedCount,
      files: filesResults as unknown as Prisma.InputJsonValue[],
    };
  }

  private isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
