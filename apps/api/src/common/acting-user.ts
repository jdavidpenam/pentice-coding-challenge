import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { InMemoryStore } from '../store/in-memory-store.js';
import type { User } from '../store/models.js';
import { DomainError } from './errors.js';

export const DEMO_USER_HEADER = 'x-demo-user-id';

const headerSchema = z.uuid();

/**
 * THE single place that decides who is acting.
 *
 * DEMO ONLY — this is not authentication. It trusts whichever user ID the caller sends, so anyone can act as
 * anyone. Ownership checks elsewhere are correct *given* this identity; they do not prove the caller owns it.
 * To make it real, replace this class with one that reads a verified session/JWT and keep the same signature.
 */
@Injectable()
export class ActingUserResolver {
  constructor(private readonly store: InMemoryStore) {}

  resolve(rawHeader: unknown): User {
    const parsed = headerSchema.safeParse(rawHeader);
    const user = parsed.success ? this.store.users.get(parsed.data) : undefined;
    if (!user) {
      throw new DomainError('DEMO_USER_REQUIRED', `Select a demo user (send a valid ${DEMO_USER_HEADER} header).`);
    }
    return user;
  }
}
