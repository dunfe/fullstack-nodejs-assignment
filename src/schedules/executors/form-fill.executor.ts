import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TaskType } from 'generated/prisma/client';
import { TaskExecutionResult, TaskExecutor } from './task-executor.interface';

@Injectable()
export class FormFillExecutor implements TaskExecutor {
  readonly type = TaskType.FORM_FILL;

  async execute(payload: Prisma.JsonValue): Promise<TaskExecutionResult> {
    await Promise.resolve();

    if (!this.isJsonObject(payload)) {
      throw new BadRequestException({
        code: 'INVALID_FORM_FILL_PAYLOAD',
        message: 'FORM_FILL payload must be an object.',
      });
    }

    const { template, data } = payload;

    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      throw new BadRequestException({
        code: 'INVALID_FORM_FILL_PAYLOAD',
        message: 'FORM_FILL payload requires object: template.',
      });
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new BadRequestException({
        code: 'INVALID_FORM_FILL_PAYLOAD',
        message: 'FORM_FILL payload requires object: data.',
      });
    }

    const filledTemplate = this.fillTemplate(template, data);

    return filledTemplate as TaskExecutionResult;
  }

  private fillTemplate(
    template: Prisma.JsonValue,
    data: Prisma.JsonObject,
  ): Prisma.JsonValue {
    if (template === null || template === undefined) {
      return template;
    }

    if (Array.isArray(template)) {
      return template.map((item) => this.fillTemplate(item, data));
    }

    if (typeof template === 'object') {
      const filled: Prisma.JsonObject = {};
      for (const [key, value] of Object.entries(template)) {
        if (value !== undefined) {
          filled[key] = this.fillTemplate(value, data);
        }
      }
      return filled;
    }

    if (typeof template === 'string') {
      // Check if the string is exactly a single placeholder: e.g. {{key}} or ${key}
      const singlePlaceholderRegex =
        /^(?:\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}|\$\{\s*([a-zA-Z0-9_.-]+)\s*\})$/;
      const singleMatch = template.match(singlePlaceholderRegex);
      if (singleMatch) {
        const p1 = singleMatch[1];
        const p2 = singleMatch[2];
        const path = p1 || p2;
        const resolved = this.getValueByPath(data, path);
        if (resolved !== undefined) {
          return resolved;
        }
        return '';
      }

      // Otherwise, replace all occurrences inside the string
      return template.replace(
        /(?:\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}|\$\{\s*([a-zA-Z0-9_.-]+)\s*\})/g,
        (match, p1: unknown, p2: unknown) => {
          const path = (p1 || p2 || '') as string;
          const resolved = this.getValueByPath(data, path);
          if (resolved === undefined) {
            return '';
          }
          if (typeof resolved === 'object' && resolved !== null) {
            return JSON.stringify(resolved);
          }
          return String(resolved);
        },
      );
    }

    return template;
  }

  private getValueByPath(
    obj: Prisma.JsonObject | Prisma.JsonValue,
    path: string,
  ): Prisma.JsonValue | undefined {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return undefined;
    }
    const parts = path.split('.');
    let current: Prisma.JsonValue = obj;
    for (const part of parts) {
      if (
        current === null ||
        typeof current !== 'object' ||
        Array.isArray(current)
      ) {
        return undefined;
      }
      const record = current as Record<string, unknown>;
      current = record[part] as Prisma.JsonValue;
    }
    return current;
  }

  private isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
