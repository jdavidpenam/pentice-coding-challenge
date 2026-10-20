import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service.js';
import { nowIso } from '../common/clock.js';
import { DomainError } from '../common/errors.js';
import { InMemoryStore } from '../store/in-memory-store.js';
import type { Account, User } from '../store/models.js';

/** Bounds in-memory growth: user creation needs no identity, so anyone can call it. */
export const MAX_USERS = 1_000;

export interface PublicUser {
  readonly id: string;
  readonly name: string;
}

/** What another user may see in order to send money: names and account IDs, never balances or history. */
export interface DirectoryEntry {
  readonly userId: string;
  readonly name: string;
  readonly accounts: readonly { readonly id: string; readonly name: string }[];
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger('Users');

  constructor(
    private readonly store: InMemoryStore,
    private readonly accounts: AccountsService,
  ) {}

  /** Creates a user with one empty account. New users are funded only by receiving transfers. */
  create(name: string): { user: PublicUser; account: Account } {
    if (this.store.users.size >= MAX_USERS) {
      throw new DomainError('USER_LIMIT_REACHED', 'The demo has reached its user limit.');
    }
    const user: User = { id: randomUUID(), name, createdAt: nowIso() };
    this.store.users.set(user.id, user);
    const account = this.accounts.open(user, 'Main');
    this.logger.log(JSON.stringify({ event: 'user.created', userId: user.id, accountId: account.id }));
    return { user: { id: user.id, name: user.name }, account };
  }

  /** For the demo user selector only. */
  list(): PublicUser[] {
    return [...this.store.users.values()].map(({ id, name }) => ({ id, name }));
  }

  directory(actingUser: User): DirectoryEntry[] {
    const accounts = [...this.store.accounts.values()];
    return [...this.store.users.values()]
      .filter((user) => user.id !== actingUser.id)
      .map((user) => ({
        userId: user.id,
        name: user.name,
        accounts: accounts.filter((a) => a.userId === user.id).map(({ id, name }) => ({ id, name })),
      }));
  }
}
