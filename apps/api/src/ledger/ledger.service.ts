import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { nowIso } from '../common/clock.js';
import { DomainError, notFound } from '../common/errors.js';
import { isValidOperationAmount, MAX_BALANCE_MINOR } from '../common/money.js';
import { InMemoryStore } from '../store/in-memory-store.js';
import type { Account, LedgerEntry, LedgerEntryKind } from '../store/models.js';

interface Posting {
  readonly account: Account;
  readonly kind: LedgerEntryKind;
  readonly availableDeltaMinor: number;
  readonly reservedDeltaMinor: number;
}

/**
 * The only code that changes balances.
 *
 * Synchronization strategy: every public method is synchronous and all-or-nothing — all checks run first, then all
 * writes happen together, with no `await` anywhere. Node runs one JavaScript task at a time, so no other request can
 * observe or change an account in the middle of one of these calls. No locks are needed, and none are ever held across
 * provider/network waits (callers do those outside). Scope: one process, in-memory state. A database-backed version
 * would need transactions or conditional updates instead.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly store: InMemoryStore) {}

  /** Debit `from` and credit `to` by the same amount, or change nothing. Ownership is checked by the caller. */
  transfer(command: { transferId: string; fromAccountId: string; toAccountId: string; amountMinor: number }): void {
    const { transferId, fromAccountId, toAccountId, amountMinor } = command;
    this.assertAmount(amountMinor);
    if (fromAccountId === toAccountId) {
      throw new DomainError('SAME_ACCOUNT', 'Source and destination must be different accounts.');
    }
    const from = this.requireAccount(fromAccountId, 'Source account');
    const to = this.requireAccount(toAccountId, 'Destination account');
    this.assertAvailable(from, amountMinor);
    if (to.availableMinor + to.reservedMinor + amountMinor > MAX_BALANCE_MINOR) {
      throw new DomainError('BALANCE_LIMIT_EXCEEDED', 'The destination account cannot hold that much.');
    }
    this.post(transferId, [
      { account: from, kind: 'TRANSFER_OUT', availableDeltaMinor: -amountMinor, reservedDeltaMinor: 0 },
      { account: to, kind: 'TRANSFER_IN', availableDeltaMinor: amountMinor, reservedDeltaMinor: 0 },
    ]);
  }

  /** Move funds from available to reserved before the provider is contacted. */
  reserveForPayment(command: { paymentId: string; accountId: string; amountMinor: number }): void {
    this.assertAmount(command.amountMinor);
    const account = this.requireAccount(command.accountId, 'Account');
    this.assertAvailable(account, command.amountMinor);
    this.post(command.paymentId, [
      { account, kind: 'PAYMENT_RESERVE', availableDeltaMinor: -command.amountMinor, reservedDeltaMinor: command.amountMinor },
    ]);
  }

  /** Confirmed success: the reserved money leaves the account. */
  captureReservation(command: { paymentId: string; accountId: string; amountMinor: number }): void {
    this.assertAmount(command.amountMinor);
    const account = this.requireAccount(command.accountId, 'Account');
    this.post(command.paymentId, [{ account, kind: 'PAYMENT_CAPTURE', availableDeltaMinor: 0, reservedDeltaMinor: -command.amountMinor }]);
  }

  /** Definitive failure: reserved money becomes available again. */
  releaseReservation(command: { paymentId: string; accountId: string; amountMinor: number }): void {
    this.assertAmount(command.amountMinor);
    const account = this.requireAccount(command.accountId, 'Account');
    this.post(command.paymentId, [
      { account, kind: 'PAYMENT_RELEASE', availableDeltaMinor: command.amountMinor, reservedDeltaMinor: -command.amountMinor },
    ]);
  }

  /** Demo funding used only by the startup seed and tests. Not reachable over HTTP. */
  seed(accountId: string, amountMinor: number): void {
    const account = this.requireAccount(accountId, 'Account');
    if (
      !Number.isSafeInteger(amountMinor) ||
      amountMinor <= 0 ||
      account.availableMinor + account.reservedMinor + amountMinor > MAX_BALANCE_MINOR
    ) {
      throw new Error('Invalid seed amount');
    }
    this.post('seed', [{ account, kind: 'SEED', availableDeltaMinor: amountMinor, reservedDeltaMinor: 0 }]);
  }

  entriesFor(accountId: string): readonly LedgerEntry[] {
    return this.store.ledger.filter((entry) => entry.accountId === accountId);
  }

  private post(referenceId: string, postings: readonly Posting[]): void {
    const createdAt = nowIso();
    // Compute every new balance first; write only if all of them are valid.
    const prepared = postings.map(({ account, kind, availableDeltaMinor, reservedDeltaMinor }) => {
      const availableAfterMinor = account.availableMinor + availableDeltaMinor;
      const reservedAfterMinor = account.reservedMinor + reservedDeltaMinor;
      if (!isNonNegativeSafe(availableAfterMinor) || !isNonNegativeSafe(reservedAfterMinor)) {
        throw new Error('Ledger invariant violated');
      }
      const entry: LedgerEntry = {
        id: randomUUID(),
        accountId: account.id,
        kind,
        availableDeltaMinor,
        reservedDeltaMinor,
        availableAfterMinor,
        reservedAfterMinor,
        referenceId,
        createdAt,
      };
      return { account: { ...account, availableMinor: availableAfterMinor, reservedMinor: reservedAfterMinor }, entry };
    });
    for (const { account, entry } of prepared) {
      this.store.accounts.set(account.id, account);
      this.store.ledger.push(entry);
    }
  }

  private requireAccount(accountId: string, label: string): Account {
    const account = this.store.accounts.get(accountId);
    if (!account) throw notFound(label);
    return account;
  }

  private assertAvailable(account: Account, amountMinor: number): void {
    if (account.availableMinor < amountMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS', 'The account does not have enough available funds.');
    }
  }

  private assertAmount(amountMinor: number): void {
    if (!isValidOperationAmount(amountMinor)) throw new Error('Invalid amount reached the ledger');
  }
}

function isNonNegativeSafe(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
