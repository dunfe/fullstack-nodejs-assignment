import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { RequestWithCorrelationId } from '../types/request-with-correlation-id.type';
import { Response } from 'express';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();

    const request = http.getRequest<RequestWithCorrelationId>();
    const response = http.getResponse<Response>();

    const incomingCorrelationId = request.header('x-correlation-id');
    const correlationId =
      incomingCorrelationId && incomingCorrelationId.trim().length > 0
        ? incomingCorrelationId
        : randomUUID();

    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    return next.handle();
  }
}
