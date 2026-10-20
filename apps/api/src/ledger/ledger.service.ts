import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { nowIso } from '../common/clock.js';
import { DomainError, notFound } from '../common/errors.js';
import { isValidOperationAmount, MAX_BALANCE_MINOR } from '../common/money.js';
import { InMemoryStore } from '../store/in-memory-store.js';
import type { Account, LedgerEntry, LedgerEntryKind } from '../store/models.js';

interface Posting {
  readonly account: Account;
  readonly deltaMinor: number;
  readonly kind: LedgerEntryKind;
}

/**
 * The only code that changes balances.
 *
 * Every public method is synchronous and all-or-nothing: all checks run first, then all writes happen together,
 * with no `await` in between. Node runs one JavaScript task at a time, so concurrent requests cannot interleave
 * inside these methods. (A database-backed version would need a transaction / conditional update instead.)
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
    this.assertFunds(from, amountMinor);
    if (to.balanceMinor + amountMinor > MAX_BALANCE_MINOR) {
      throw new DomainError('BALANCE_LIMIT_EXCEEDED', 'The destination account cannot hold that much.');
    }
    this.post(transferId, [
      { account: from, deltaMinor: -amountMinor, kind: 'TRANSFER_OUT' },
      { account: to, deltaMinor: amountMinor, kind: 'TRANSFER_IN' },
    ]);
  }

  /** Take payment funds out of the account before the provider is called. */
  holdForPayment(command: { paymentId: string; accountId: string; amountMinor: number }): void {
    this.assertAmount(command.amountMinor);
    const account = this.requireAccount(command.accountId, 'Account');
    this.assertFunds(account, command.amountMinor);
    this.post(command.paymentId, [{ account, deltaMinor: -command.amountMinor, kind: 'PAYMENT_HOLD' }]);
  }

  /**
   * Return held funds after a definitive provider decline. Not subject to MAX_BALANCE_MINOR: returning money
   * that was already in the account must never fail (the result stays a safe integer because amounts are capped).
   */
  releasePaymentHold(command: { paymentId: string; accountId: string; amountMinor: number }): void {
    this.assertAmount(command.amountMinor);
    const account = this.requireAccount(command.accountId, 'Account');
    this.post(command.paymentId, [{ account, deltaMinor: command.amountMinor, kind: 'PAYMENT_RELEASE' }]);
  }

  /** Demo funding used only by the startup seed and tests. Not reachable over HTTP. */
  seed(accountId: string, amountMinor: number): void {
    const account = this.requireAccount(accountId, 'Account');
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || account.balanceMinor + amountMinor > MAX_BALANCE_MINOR) {
      throw new Error('Invalid seed amount');
    }
    this.post('seed', [{ account, deltaMinor: amountMinor, kind: 'SEED' }]);
  }

  entriesFor(accountId: string): readonly LedgerEntry[] {
    return this.store.ledger.filter((entry) => entry.accountId === accountId);
  }

  private post(referenceId: string, postings: readonly Posting[]): void {
    const createdAt = nowIso();
    // Compute every new balance first; write only if all of them are valid.
    const prepared = postings.map(({ account, deltaMinor, kind }) => {
      const balanceAfterMinor = account.balanceMinor + deltaMinor;
      if (!Number.isSafeInteger(balanceAfterMinor) || balanceAfterMinor < 0) {
        throw new Error('Ledger invariant violated');
      }
      const entry: LedgerEntry = {
        id: randomUUID(),
        accountId: account.id,
        kind,
        amountMinor: deltaMinor,
        balanceAfterMinor,
        referenceId,
        createdAt,
      };
      return { account: { ...account, balanceMinor: balanceAfterMinor }, entry };
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

  private assertFunds(account: Account, amountMinor: number): void {
    if (account.balanceMinor < amountMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS', 'The account does not have enough funds.');
    }
  }

  private assertAmount(amountMinor: number): void {
    if (!isValidOperationAmount(amountMinor)) throw new Error('Invalid amount reached the ledger');
  }
}
