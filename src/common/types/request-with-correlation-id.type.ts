import { Request } from 'express';

export type RequestWithCorrelationId = Request & {
  correlationId?: string;
};
