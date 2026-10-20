import { api, type Account, type DirectoryEntry, type LedgerEntry, type Payment, type Transfer } from './api';

export interface Dashboard {
  readonly accounts: readonly Account[];
  readonly directory: readonly DirectoryEntry[];
  readonly transactions: ReadonlyMap<string, readonly LedgerEntry[]>;
  readonly transfers: readonly Transfer[];
  readonly payments: readonly Payment[];
}

/** Loads everything the acting user may see. Re-run after every change; the UI never computes balances itself. */
export async function loadDashboard(userId: string): Promise<Dashboard> {
  const [accounts, directory, transfers, payments] = await Promise.all([
    api.accounts(userId),
    api.directory(userId),
    api.transfers(userId),
    api.payments(userId),
  ]);
  const histories = await Promise.all(accounts.map(async (a) => [a.id, await api.transactions(userId, a.id)] as const));
  return { accounts, directory, transfers, payments, transactions: new Map(histories) };
}

/** Human label for any account ID the user can address (their own, or one from the directory). */
export function accountLabel(dashboard: Dashboard, accountId: string): string {
  const own = dashboard.accounts.find((a) => a.id === accountId);
  if (own) return `My ${own.name}`;
  for (const person of dashboard.directory) {
    const account = person.accounts.find((a) => a.id === accountId);
    if (account) return `${person.name} · ${account.name}`;
  }
  return 'Unknown account';
}
