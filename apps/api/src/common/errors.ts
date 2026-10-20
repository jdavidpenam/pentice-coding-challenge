export type DomainErrorCode =
  | 'VALIDATION_FAILED'
  | 'DEMO_USER_REQUIRED'
  | 'NOT_FOUND'
  | 'SAME_ACCOUNT'
  | 'INSUFFICIENT_FUNDS'
  | 'BALANCE_LIMIT_EXCEEDED'
  | 'ACCOUNT_LIMIT_REACHED';

export interface ErrorDetail {
  readonly path: string;
  readonly message: string;
}

/** An expected, client-facing failure. Its message is safe to return to the caller. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: readonly ErrorDetail[],
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function httpStatusFor(code: DomainErrorCode): number {
  switch (code) {
    case 'VALIDATION_FAILED':
      return 400;
    case 'DEMO_USER_REQUIRED':
      return 401;
    case 'NOT_FOUND':
      return 404;
    case 'SAME_ACCOUNT':
    case 'INSUFFICIENT_FUNDS':
    case 'BALANCE_LIMIT_EXCEEDED':
    case 'ACCOUNT_LIMIT_REACHED':
      return 422;
    default: {
      const unhandled: never = code;
      throw new Error(`Unhandled error code: ${String(unhandled)}`);
    }
  }
}

export function notFound(what: string): DomainError {
  return new DomainError('NOT_FOUND', `${what} not found.`);
}
