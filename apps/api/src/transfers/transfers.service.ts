import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { nowIso } from '../common/clock.js';
import { notFound } from '../common/errors.js';
import { CURRENCY } from '../common/money.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { InMemoryStore } from '../store/in-memory-store.js';
import type { Transfer, User } from '../store/models.js';

@Injectable()
export class TransfersService {
  private readonly logger = new Logger('Transfers');

  constructor(
    private readonly store: InMemoryStore,
    private readonly ledger: LedgerService,
  ) {}

  /** Moves money from an account the acting user owns to any existing account (theirs or another user's). */
  create(actingUser: User, command: { fromAccountId: string; toAccountId: string; amountMinor: number }): Transfer {
    const from = this.store.accounts.get(command.fromAccountId);
    if (!from || from.userId !== actingUser.id) throw notFound('Source account');

    const transfer: Transfer = {
      id: randomUUID(),
      fromAccountId: command.fromAccountId,
      toAccountId: command.toAccountId,
      amountMinor: command.amountMinor,
      currency: CURRENCY,
      initiatedByUserId: actingUser.id,
      createdAt: nowIso(),
    };
    try {
      this.ledger.transfer({ transferId: transfer.id, ...command });
    } catch (error) {
      this.logger.log(
        JSON.stringify({ event: 'transfer.rejected', from: command.fromAccountId, to: command.toAccountId, amountMinor: command.amountMinor }),
      );
      throw error;
    }
    // Same synchronous block as the ledger write: the record exists if and only if the money moved.
    this.store.transfers.set(transfer.id, transfer);
    this.logger.log(
      JSON.stringify({ event: 'transfer.completed', transferId: transfer.id, from: transfer.fromAccountId, to: transfer.toAccountId, amountMinor: transfer.amountMinor }),
    );
    return transfer;
  }

  /** Transfers where the acting user owns the source or the destination account. Newest first. */
  listFor(actingUser: User): Transfer[] {
    const owns = (accountId: string): boolean => this.store.accounts.get(accountId)?.userId === actingUser.id;
    return [...this.store.transfers.values()]
      .filter((t) => owns(t.fromAccountId) || owns(t.toAccountId))
      .reverse();
  }
}
