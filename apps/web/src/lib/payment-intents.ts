/**
 * Idempotency-Keys for payments whose outcome is not final yet, keyed by acting user + exact payload.
 *
 * Lives outside React (and in sessionStorage) so "pay again with the same details; you won't be charged twice"
 * still holds after a user switch remounts the Pay screen or the tab reloads. Storage is a convenience: if it
 * is unavailable the map still covers the current page load.
 */
export interface PaymentIntent {
  readonly key: string;
  readonly paymentId?: string;
}

const STORAGE_KEY = 'calm-wallet-payment-intents';
const intents = new Map<string, PaymentIntent>(load());

function load(): [string, PaymentIntent][] {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry): entry is [string, PaymentIntent] =>
      Array.isArray(entry) && typeof entry[0] === 'string' && typeof (entry[1] as { key?: unknown } | null)?.key === 'string');
  } catch {
    return [];
  }
}

function save(): void {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...intents])); } catch { /* storage unavailable */ }
}

const id = (userId: string, payload: string) => `${userId}|${payload}`;

export function findIntent(userId: string, payload: string): PaymentIntent | undefined {
  return intents.get(id(userId, payload));
}

export function rememberIntent(userId: string, payload: string, intent: PaymentIntent): void {
  intents.set(id(userId, payload), intent);
  save();
}

export function forgetIntent(userId: string, payload: string): void {
  if (intents.delete(id(userId, payload))) save();
}

/** Tests only. */
export function clearIntents(): void {
  intents.clear();
  save();
}
