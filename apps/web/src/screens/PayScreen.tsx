import { useRef, useState, type SyntheticEvent } from 'react';
import { api, ApiError, describeError, type Account, type Payment } from '../api';
import { AmountInput } from '../components/AmountInput';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Select } from '../components/Select';
import { STATUS, StatusBadge } from '../components/StatusBadge';
import { validateAmount } from '../lib/amount';
import { checkedLabel, type CheckResult } from '../lib/check';
import { money } from '../lib/format';
import './screens.css';

interface Props {
  readonly hidden: boolean;
  readonly userId: string;
  readonly accounts: readonly Account[];
  readonly payments: readonly Payment[];
  readonly checkResults: Readonly<Record<string, CheckResult>>;
  readonly checkingPaymentId: string | null;
  readonly onCheck: (payment: Payment) => void;
  readonly onAllPayments: () => void;
  readonly onChanged: () => void;
}

/** Outcome copy, exactly as specified in the handoff. */
export function outcomeCopy(payment: Payment, accountName: string): string {
  const amount = money(payment.amountMinor);
  switch (payment.status) {
    case 'SUCCEEDED':
      return `Paid from ${accountName}. It's in your payments as Paid.`;
    case 'FAILED':
      return `The provider declined this payment. ${amount} is back in Available in ${accountName}.`;
    case 'UNKNOWN':
      return `The provider didn't reply, so we don't know yet if it charged. ${amount} is held in Reserved — not lost. Check status, or pay again with the same details; you won't be charged twice.`;
    case 'PROCESSING':
      return `The provider hasn't charged yet. ${amount} is held in Reserved until it does, or releases it.`;
  }
}

const isPending = (p: Payment) => p.status === 'UNKNOWN' || p.status === 'PROCESSING';

export function PayScreen({ hidden, userId, accounts, payments, checkResults, checkingPaymentId, onCheck, onAllPayments, onChanged }: Props) {
  const [from, setFrom] = useState('');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string>();
  /** The server's response for the last payment; shown even if the refresh after it fails. */
  const [lastResponse, setLastResponse] = useState<Payment>();
  const [dedupedNote, setDedupedNote] = useState(false);
  /**
   * One Idempotency-Key per intended payment. Kept while the outcome is unconfirmed so identical details retry the
   * SAME payment (the backend then reconciles instead of charging again); replaced when the details change or the
   * payment is final.
   */
  const intent = useRef<{ key: string; payload: string; paymentId?: string } | null>(null);
  const inFlight = useRef(false);

  const fromAccount = accounts.find((a) => a.id === from) ?? accounts[0];
  const check = validateAmount(amount);
  const amountError = touched && !check.ok ? check.error : undefined;
  const refError = touched && reference.trim() === '' ? 'Enter the booking reference from your hotel.' : undefined;
  const refreshed = payments.find((p) => p.id === lastResponse?.id);
  const last = refreshed && lastResponse && refreshed.updatedAt >= lastResponse.updatedAt ? refreshed : lastResponse;
  const lastAccount = accounts.find((a) => a.id === last?.accountId);
  const lastCheck = last ? checkResults[last.id] : undefined;

  async function pay(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (inFlight.current || !check.ok || reference.trim() === '' || !fromAccount) return;
    const body = { accountId: fromAccount.id, amountMinor: check.minor, reference: reference.trim() };
    const payload = JSON.stringify(body);
    const current = intent.current?.payload === payload ? intent.current : { key: crypto.randomUUID(), payload };
    const isRetryOfPending = current === intent.current && current.paymentId !== undefined;
    intent.current = current;

    inFlight.current = true;
    setSending(true);
    setServerError(undefined);
    try {
      const payment = await api.pay(userId, current.key, body);
      intent.current = isPending(payment) ? { ...current, paymentId: payment.id } : null;
      setDedupedNote(isRetryOfPending && current.paymentId === payment.id);
      setLastResponse(payment);
      onChanged();
    } catch (error) {
      // A 4xx was a definitive rejection before anything happened: the next attempt is a new payment.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) intent.current = null;
      setServerError(describeError(error));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <div className="screen" hidden={hidden}>
      <form className="form-card" onSubmit={(e) => { void pay(e); }} noValidate aria-label="Pay for a room">
        <Field label="Pay from" helper={fromAccount ? `${money(fromAccount.availableMinor)} available in ${fromAccount.name}` : undefined}>
          {({ id, describedBy }) => (
            <Select id={id} aria-describedby={describedBy} value={fromAccount?.id ?? ''} onChange={(e) => { setFrom(e.target.value); }}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {money(a.availableMinor)} available</option>)}
            </Select>
          )}
        </Field>
        <Field label="Booking reference" error={refError}>
          {({ id, describedBy, invalid }) => (
            <input id={id} className="input" aria-describedby={describedBy} aria-invalid={invalid || undefined} value={reference}
              onChange={(e) => { setReference(e.target.value); }} onBlur={() => { if (reference !== '') setTouched(true); }}
              placeholder="Room 204 #BK-1029" maxLength={64} autoComplete="off" />
          )}
        </Field>
        <Field label="Amount (USD)" helper="The amount on your booking, in USD." error={amountError}>
          {({ id, describedBy, invalid }) => (
            <AmountInput id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} value={amount} onValueChange={setAmount} onBlur={() => { setTouched(true); }} />
          )}
        </Field>
        {serverError && <Banner tone="danger" glyph="!" role="alert"><strong>Payment not made</strong><br />{serverError}</Banner>}
        <Button type="submit" block loading={sending} loadingLabel="Contacting provider…">
          {check.ok ? `Pay ${money(check.minor)}` : 'Pay'}
        </Button>
        <p className="note">No card details needed — paid from your wallet through a simulated provider.</p>
      </form>

      <div aria-live="polite" role="status">
        {last && (
          <section className={`result tone-${STATUS[last.status].tone}`}>
            <div className="result__top">
              <StatusBadge status={last.status} />
              <span className="result__amount">{money(last.amountMinor)}</span>
            </div>
            <p className="result__ref">{last.reference}</p>
            <p>{outcomeCopy(last, lastAccount?.name ?? 'your account')}</p>
            {dedupedNote && <p>You already had this payment in progress, so we checked its status instead of charging again.</p>}
            {lastCheck && <p className="result__checked">{checkedLabel(lastCheck)} — {lastCheck.text}</p>}
            <div className="result__actions">
              {isPending(last) && (
                <Button variant="secondary" loading={checkingPaymentId === last.id} loadingLabel="Checking…" disabled={checkingPaymentId !== null} onClick={() => { onCheck(last); }}>Check status</Button>
              )}
              <Button variant="secondary" onClick={onAllPayments}>All payments</Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
