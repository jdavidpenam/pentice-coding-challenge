import { useState, type SyntheticEvent } from 'react';
import { api, type Account, type Payment } from '../api';
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
      return `Declined: ${payment.failureReason} Your funds were returned.`;
    case 'PENDING':
      return 'The provider did not confirm the payment. Your funds are held until it is resolved.';
  }
}

export function PaymentForm({ userId, accounts, onChanged }: Props) {
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [amountError, setAmountError] = useState<string>();
  const submit = useSubmit();

  function pay(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(amount);
    if (!parsed.ok) {
      setAmountError(parsed.error);
      return;
    }
    setAmountError(undefined);
    void submit.run(async () => {
      const payment = await api.pay(userId, { accountId, amountMinor: parsed.minor, reference });
      onChanged();
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
                {a.name} — {formatMinor(a.balanceMinor)}
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
