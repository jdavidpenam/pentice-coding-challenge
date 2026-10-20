/** Typed client for the local API. The backend is the only source of truth for balances and statuses. */

export interface PublicUser {
  readonly id: string;
  readonly name: string;
}
export interface Account {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly currency: 'USD';
  readonly balanceMinor: number;
  readonly createdAt: string;
}
export interface DirectoryEntry {
  readonly userId: string;
  readonly name: string;
  readonly accounts: readonly { readonly id: string; readonly name: string }[];
}
export type LedgerEntryKind = 'SEED' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'PAYMENT_HOLD' | 'PAYMENT_RELEASE';
export interface LedgerEntry {
  readonly id: string;
  readonly accountId: string;
  readonly kind: LedgerEntryKind;
  readonly amountMinor: number;
  readonly balanceAfterMinor: number;
  readonly referenceId: string;
  readonly createdAt: string;
}
export interface Transfer {
  readonly id: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly amountMinor: number;
  readonly createdAt: string;
}
interface PaymentBase {
  readonly id: string;
  readonly accountId: string;
  readonly amountMinor: number;
  readonly reference: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export type Payment =
  | (PaymentBase & { readonly status: 'PENDING' })
  | (PaymentBase & { readonly status: 'SUCCEEDED'; readonly providerChargeId: string })
  | (PaymentBase & { readonly status: 'FAILED'; readonly failureReason: string });
export type SimulatorMode = 'approve' | 'decline';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST';
  readonly body?: unknown;
  readonly userId?: string;
}

async function call<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.userId) headers['x-demo-user-id'] = options.userId;
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the API. Is it running?');
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw toApiError(response.status, data);
  // Responses come from our own API; their shape is fixed by its contract (runtime response validation is deferred).
  return data as T;
}

function toApiError(status: number, data: unknown): ApiError {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const { error } = data;
    if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
      const { code, message } = error;
      if (typeof code === 'string' && typeof message === 'string') return new ApiError(status, code, message);
    }
  }
  return new ApiError(status, 'UNEXPECTED', `Request failed (${status}).`);
}

export const api = {
  listUsers: () => call<PublicUser[]>('/users'),
  createUser: (name: string) => call<{ user: PublicUser; account: Account }>('/users', { method: 'POST', body: { name } }),
  directory: (userId: string) => call<DirectoryEntry[]>('/directory', { userId }),
  accounts: (userId: string) => call<Account[]>('/accounts', { userId }),
  openAccount: (userId: string, name: string) => call<Account>('/accounts', { method: 'POST', userId, body: { name } }),
  transactions: (userId: string, accountId: string) =>
    call<LedgerEntry[]>(`/accounts/${encodeURIComponent(accountId)}/transactions`, { userId }),
  transfers: (userId: string) => call<Transfer[]>('/transfers', { userId }),
  transfer: (userId: string, body: { fromAccountId: string; toAccountId: string; amountMinor: number }) =>
    call<Transfer>('/transfers', { method: 'POST', userId, body }),
  payments: (userId: string) => call<Payment[]>('/payments', { userId }),
  pay: (userId: string, body: { accountId: string; amountMinor: number; reference: string }) =>
    call<Payment>('/payments', { method: 'POST', userId, body }),
  devProvider: () => call<{ mode: SimulatorMode }>('/dev/provider'),
  setDevProviderMode: (mode: SimulatorMode) => call<{ mode: SimulatorMode }>('/dev/provider/mode', { method: 'POST', body: { mode } }),
};

export function describeError(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong.';
}
