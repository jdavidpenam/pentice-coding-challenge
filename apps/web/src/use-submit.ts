import { useRef, useState } from 'react';
import { describeError } from './api';

export interface Outcome {
  readonly kind: 'success' | 'error';
  readonly message: string;
}
export type SubmitResult = Outcome | null;

/**
 * Runs one submission at a time and blocks repeat clicks while it is in flight.
 * This is a UI convenience only — it is NOT server-side idempotency; a retried or duplicated HTTP request
 * would still reach the API.
 */
export function useSubmit() {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitResult>(null);

  async function run(task: () => Promise<Outcome>): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setResult(null);
    try {
      setResult(await task());
    } catch (error) {
      setResult({ kind: 'error', message: describeError(error) });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return { run, pending, result };
}
