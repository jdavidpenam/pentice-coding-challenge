import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { DomainError, httpStatusFor, type ErrorDetail } from './errors.js';

export interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string; readonly details?: readonly ErrorDetail[] };
}

const logger = new Logger('Errors');

/** Turns any thrown value into a safe response: domain errors keep their message; everything else is generic. */
export function toErrorResponse(exception: unknown): { status: number; body: ErrorBody } {
  if (exception instanceof DomainError) {
    const error = exception.details
      ? { code: exception.code, message: exception.message, details: exception.details }
      : { code: exception.code, message: exception.message };
    return { status: httpStatusFor(exception.code), body: { error } };
  }
  const status = statusOf(exception);
  if (status !== undefined && status >= 400 && status < 500) {
    return { status, body: { error: genericClientError(status) } };
  }
  logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : 'Non-error thrown');
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong.' } } };
}

function statusOf(exception: unknown): number | undefined {
  if (exception instanceof HttpException) return exception.getStatus();
  // body-parser errors (malformed JSON, payload too large) carry a numeric `status`.
  if (typeof exception === 'object' && exception !== null && 'status' in exception) {
    const { status } = exception;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

function genericClientError(status: number): { code: string; message: string } {
  switch (status) {
    case 400:
      return { code: 'BAD_REQUEST', message: 'The request body could not be read.' };
    case 404:
      return { code: 'NOT_FOUND', message: 'Not found.' };
    case 413:
      return { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' };
    case 415:
      return { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Send JSON.' };
    default:
      return { code: 'BAD_REQUEST', message: 'The request was rejected.' };
  }
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = toErrorResponse(exception);
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }
}

/** Express error middleware for failures that happen before Nest routing (body parsing). */
export function bodyParserErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  const { status, body } = toErrorResponse(err);
  res.status(status).json(body);
}
