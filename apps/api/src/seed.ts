import type { INestApplication } from '@nestjs/common';
import { AccountsService } from './accounts/accounts.service.js';
import { LedgerService } from './ledger/ledger.service.js';
import { InMemoryStore } from './store/in-memory-store.js';
import { UsersService } from './users/users.service.js';

/**
 * Explicit demo funding — the only way money enters the system (there is no deposit endpoint).
 * Amounts in cents. Recorded as SEED ledger entries so balances still equal the sum of entries.
 */
const DEMO_USERS = [
  { name: 'Alice', accounts: [{ name: 'Main', fundsMinor: 125_000 }, { name: 'Savings', fundsMinor: 30_000 }] },
  { name: 'Bob', accounts: [{ name: 'Main', fundsMinor: 48_000 }] },
  { name: 'Carol', accounts: [{ name: 'Main', fundsMinor: 0 }] },
] as const;

export function seedDemoData(app: INestApplication): void {
  const users = app.get(UsersService);
  const accounts = app.get(AccountsService);
  const ledger = app.get(LedgerService);
  const store = app.get(InMemoryStore);

  for (const demo of DEMO_USERS) {
    const { user, account: main } = users.create(demo.name);
    const owner = store.users.get(user.id);
    if (!owner) throw new Error('Seed user missing');
    demo.accounts.forEach((spec, index) => {
      const account = index === 0 ? main : accounts.open(owner, spec.name);
      if (spec.fundsMinor > 0) ledger.seed(account.id, spec.fundsMinor);
    });
  }
}
