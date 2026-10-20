import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { DomainError } from './errors.js';

/** Validates an untrusted request value (body, param, query, header) and returns the typed, parsed value. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new DomainError(
      'VALIDATION_FAILED',
      'The request is invalid.',
      result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    );
  }
}
