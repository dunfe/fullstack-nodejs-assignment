import { BadRequestException, Injectable } from '@nestjs/common';
import { TaskType } from 'generated/prisma/enums';

@Injectable()
export class TaskPayloadValidator {
  validate(type: TaskType, payload: Record<string, unknown>) {
    switch (type) {
      case TaskType.FILE_READ:
        this.validateFileReadPayload(payload);
        return;

      case TaskType.FILE_IMPORT:
        this.validateFileImportPayload(payload);
        return;

      case TaskType.FORM_FILL:
        this.validateFormFillPayload(payload);
        return;

      case TaskType.EMAIL:
        this.validateEmailPayload(payload);
        return;
    }
  }

  private validateFileReadPayload(payload: Record<string, unknown>) {
    if (!this.isNonEmptyString(payload.path)) {
      this.throwInvalidPayload(
        'FILE_READ payload requires non-empty string: path.',
      );
    }
  }

  private validateFileImportPayload(payload: Record<string, unknown>) {
    if (!Array.isArray(payload.paths)) {
      this.throwInvalidPayload('FILE_IMPORT payload requires array: paths.');
    }

    if (payload.paths.length === 0) {
      this.throwInvalidPayload('FILE_IMPORT payload paths must not be empty.');
    }

    const allPathsAreValid = payload.paths.every((path) =>
      this.isNonEmptyString(path),
    );

    if (!allPathsAreValid) {
      this.throwInvalidPayload(
        'FILE_IMPORT payload paths must contain only non-empty strings.',
      );
    }
  }

  private validateFormFillPayload(payload: Record<string, unknown>) {
    if (!this.isPlainObject(payload.template)) {
      this.throwInvalidPayload('FORM_FILL payload requires object: template.');
    }

    if (!this.isPlainObject(payload.data)) {
      this.throwInvalidPayload('FORM_FILL payload requires object: data.');
    }
  }

  private validateEmailPayload(payload: Record<string, unknown>) {
    if (!Array.isArray(payload.to)) {
      this.throwInvalidPayload('EMAIL payload requires array: to.');
    }

    if (payload.to.length === 0) {
      this.throwInvalidPayload('EMAIL payload to must not be empty.');
    }

    const allRecipientsAreValid = payload.to.every((recipient) =>
      this.isNonEmptyString(recipient),
    );

    if (!allRecipientsAreValid) {
      this.throwInvalidPayload(
        'EMAIL payload to must contain only non-empty strings.',
      );
    }

    if (!this.isNonEmptyString(payload.subject)) {
      this.throwInvalidPayload(
        'EMAIL payload requires non-empty string: subject.',
      );
    }

    if (!this.isNonEmptyString(payload.body)) {
      this.throwInvalidPayload(
        'EMAIL payload requires non-empty string: body.',
      );
    }
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private throwInvalidPayload(message: string): never {
    throw new BadRequestException({
      code: 'INVALID_TASK_PAYLOAD',
      message,
    });
  }
}
