import { useRef, useState, type SyntheticEvent } from 'react';
import { api, ApiError, type Account, type Payment } from '../api';
import { formatMinor, parseAmount } from '../money';
import { useSubmit } from '../use-submit';
import { AmountField } from './AmountField';
import { Status } from './Status';

interface Props {
  readonly userId: string;
  readonly accounts: readonly Account[];
  readonly onChanged: () => void;
}

export function describePayment(payment: Payment): string {
  switch (payment.status) {
    case 'SUCCEEDED':
      return `Paid ${formatMinor(payment.amountMinor)} for “${payment.reference}”.`;
    case 'FAILED':
      return `Payment declined. Provider said: ${payment.failureReason} Your funds were returned.`;
    case 'UNKNOWN':
      return 'Not confirmed yet: the provider did not give a final answer. Your funds are reserved (not lost). Use “Check status”, or press Pay again to retry the same payment safely.';
    case 'PROCESSING':
      return 'Still processing with the provider. Your funds are reserved. Use “Check status” in a moment.';
  }
}

/**
 * The Idempotency-Key identifies one intended payment. It is kept while the outcome is unconfirmed (network error,
 * 5xx, UNKNOWN/PROCESSING) so pressing Pay again retries the SAME payment, and replaced once the payment is final,
 * definitively rejected, or the form contents change.
 */
export function PaymentForm({ userId, accounts, onChanged }: Props) {
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [amountError, setAmountError] = useState<string>();
  const intent = useRef<{ key: string; payload: string } | null>(null);
  const submit = useSubmit();

  function pay(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(amount);
    if (!parsed.ok) {
      setAmountError(parsed.error);
      return;
    }
    setAmountError(undefined);
    const body = { accountId, amountMinor: parsed.minor, reference: reference.trim() };
    const payload = JSON.stringify(body);
    const current = intent.current?.payload === payload ? intent.current : { key: crypto.randomUUID(), payload };
    intent.current = current;

    void submit.run(async () => {
      let payment: Payment;
      try {
        payment = await api.pay(userId, current.key, body);
      } catch (error) {
        const definitive = error instanceof ApiError && error.status >= 400 && error.status < 500;
        if (definitive) intent.current = null; // rejected before anything happened; a retry is a new payment
        throw error;
      }
      onChanged();
      if (payment.status === 'SUCCEEDED' || payment.status === 'FAILED') intent.current = null;
      if (payment.status !== 'SUCCEEDED') return { kind: 'error', message: describePayment(payment) };
      setAmount('');
      setReference('');
      return { kind: 'success', message: describePayment(payment) };
    });
  }

  return (
    <section className="card" aria-labelledby="payment">
      <h2 id="payment">Pay for a room</h2>
      <p className="hint">Goes through a simulated payment provider. No card details are collected.</p>
      <form onSubmit={pay} className="stack">
        <label>
          Pay from
          <select value={accountId} onChange={(e) => { setAccountId(e.target.value); }} required>
            <option value="">Choose an account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {formatMinor(a.availableMinor)} available
              </option>
            ))}
          </select>
        </label>
        <AmountField value={amount} onChange={setAmount} error={amountError} />
        <label>
          Booking reference
          <input
            value={reference}
            onChange={(e) => { setReference(e.target.value); }}
            maxLength={64}
            pattern="[A-Za-z0-9 _#\-]+"
            title="Letters, numbers, spaces, and _ # -"
            placeholder="Room 204 #BK-1029"
            required
          />
        </label>
        <button type="submit" disabled={submit.pending}>
          {submit.pending ? 'Paying…' : 'Pay'}
        </button>
      </form>
      <Status result={submit.result} />
    </section>
  );
}
