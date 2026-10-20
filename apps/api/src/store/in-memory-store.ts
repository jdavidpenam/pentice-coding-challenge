import { Injectable } from '@nestjs/common';
import type { Account, IdempotencyRecord, LedgerEntry, Payment, Transfer, User } from './models.js';

/**
 * Process-local state. Lost on restart; mutable, so not a tamper-proof audit trail.
 * Balances and ledger entries must only be written through LedgerService.
 */
@Injectable()
export class InMemoryStore {
  readonly users = new Map<string, User>();
  readonly accounts = new Map<string, Account>();
  readonly ledger: LedgerEntry[] = [];
  readonly transfers = new Map<string, Transfer>();
  readonly payments = new Map<string, Payment>();
  /** Key: `${userId}:payment:${idempotencyKey}`. */
  readonly idempotency = new Map<string, IdempotencyRecord>();
}
