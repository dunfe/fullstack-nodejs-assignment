import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { RequestWithCorrelationId } from '../types/request-with-correlation-id.type';

type ErrorResponseBody = {
  code?: string;
  message?: string | string[];
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();

    const request = http.getRequest<RequestWithCorrelationId>();
    const response = http.getResponse<Response>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const normalized = this.normalizeExceptionResponse(exceptionResponse);

    const correlationId = request.correlationId ?? 'unknown';

    if (statusCode >= 500) {
      this.logger.error(
        {
          correlationId,
          path: request.url,
          method: request.method,
          exception,
        },
        'Unhandled server error',
      );
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      code: normalized.code,
      message: normalized.message,
      path: request.url,
      correlationId,
      timestamp: new Date().toISOString(),
    });
  }

  private normalizeExceptionResponse(response: unknown): {
    code: string;
    message: string | string[];
  } {
    if (this.isErrorResponseBody(response)) {
      return {
        code: response.code ?? 'HTTP_ERROR',
        message: response.message ?? 'Request failed.',
      };
    }

    if (typeof response === 'string') {
      return {
        code: 'HTTP_ERROR',
        message: response,
      };
    }

    return {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error.',
    };
  }

  private isErrorResponseBody(value: unknown): value is ErrorResponseBody {
    return typeof value === 'object' && value !== null;
  }
}
