import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { nowIso } from '../common/clock.js';
import { DomainError, notFound } from '../common/errors.js';
import { CURRENCY } from '../common/money.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { InMemoryStore } from '../store/in-memory-store.js';
import type { Account, LedgerEntry, User } from '../store/models.js';

export const MAX_ACCOUNTS_PER_USER = 10;

@Injectable()
export class AccountsService {
  private readonly logger = new Logger('Accounts');

  constructor(
    private readonly store: InMemoryStore,
    private readonly ledger: LedgerService,
  ) {}

  open(owner: User, name: string): Account {
    if (this.listFor(owner).length >= MAX_ACCOUNTS_PER_USER) {
      throw new DomainError('ACCOUNT_LIMIT_REACHED', `A user can have at most ${MAX_ACCOUNTS_PER_USER} accounts.`);
    }
    const account: Account = {
      id: randomUUID(),
      userId: owner.id,
      name,
      currency: CURRENCY,
      availableMinor: 0,
      reservedMinor: 0,
      createdAt: nowIso(),
    };
    this.store.accounts.set(account.id, account);
    this.logger.log(JSON.stringify({ event: 'account.opened', accountId: account.id, userId: owner.id }));
    return account;
  }

  listFor(owner: User): Account[] {
    return [...this.store.accounts.values()].filter((account) => account.userId === owner.id);
  }

  /** Returns the account only if `owner` owns it; otherwise the same 404 as a non-existent ID. */
  getOwned(owner: User, accountId: string): Account {
    const account = this.store.accounts.get(accountId);
    if (!account || account.userId !== owner.id) throw notFound('Account');
    return account;
  }

  /** Newest first. */
  transactionsFor(owner: User, accountId: string): LedgerEntry[] {
    const account = this.getOwned(owner, accountId);
    return [...this.ledger.entriesFor(account.id)].reverse();
  }
}
