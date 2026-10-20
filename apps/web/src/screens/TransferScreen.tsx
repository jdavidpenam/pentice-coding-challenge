import { useState, type SyntheticEvent } from 'react';
import { api, describeError, type Account, type DirectoryEntry } from '../api';
import { AmountInput } from '../components/AmountInput';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { SegmentedControl } from '../components/SegmentedControl';
import { Select } from '../components/Select';
import { Sheet } from '../components/Sheet';
import { validateAmount } from '../lib/amount';
import { money } from '../lib/format';
import './screens.css';

interface Props {
  readonly hidden: boolean;
  readonly userId: string;
  readonly accounts: readonly Account[];
  readonly directory: readonly DirectoryEntry[];
  readonly onChanged: () => void;
}

type Phase =
  | { readonly kind: 'form' }
  | { readonly kind: 'review'; readonly amountMinor: number; readonly error?: string }
  | { readonly kind: 'sending'; readonly amountMinor: number }
  | { readonly kind: 'success'; readonly amountMinor: number; readonly availableBeforeMinor: number };

export function TransferScreen({ hidden, userId, accounts, directory, onChanged }: Props) {
  const [from, setFrom] = useState('');
  const [toMode, setToMode] = useState<'own' | 'person'>('own');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });

  const fromAccount = accounts.find((a) => a.id === from) ?? accounts[0];
  const fromId = fromAccount?.id ?? '';
  const ownTargets = accounts.filter((a) => a.id !== fromId);
  const personTargets = directory.flatMap((p) => p.accounts.map((a) => ({ id: a.id, label: `${p.name} · ${a.name}` })));
  const targets = toMode === 'own' ? ownTargets.map((a) => ({ id: a.id, label: a.name })) : personTargets;
  const toId = targets.some((t) => t.id === to) ? to : (targets[0]?.id ?? '');
  const toLabel = targets.find((t) => t.id === toId)?.label ?? '';

  const check = validateAmount(amount);
  const amountError = touched && !check.ok ? check.error : undefined;
  const overWarning = check.ok && fromAccount && check.minor > fromAccount.availableMinor
    ? `That's more than ${fromAccount.name}'s ${money(fromAccount.availableMinor)} available.` : undefined;

  function review(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!check.ok || !fromId || !toId) return;
    setPhase({ kind: 'review', amountMinor: check.minor });
  }

  async function send(amountMinor: number) {
    if (phase.kind === 'sending') return; // ignore re-entry while in flight
    const availableBeforeMinor = fromAccount?.availableMinor ?? 0;
    setPhase({ kind: 'sending', amountMinor });
    try {
      await api.transfer(userId, { fromAccountId: fromId, toAccountId: toId, amountMinor });
      setPhase({ kind: 'success', amountMinor, availableBeforeMinor });
      onChanged();
    } catch (error) {
      setPhase({ kind: 'review', amountMinor, error: describeError(error) });
    }
  }

  function done() {
    setPhase({ kind: 'form' });
    setAmount('');
    setTouched(false);
  }

  const sending = phase.kind === 'sending';
  return (
    <div className="screen" hidden={hidden}>
      <form className="form-card" onSubmit={review} noValidate aria-label="Transfer money">
        <Field label="From" helper={fromAccount && fromAccount.reservedMinor > 0 ? `${money(fromAccount.reservedMinor)} is reserved and can't be sent.` : 'Only available money can be sent.'}>
          {({ id, describedBy }) => (
            <Select id={id} aria-describedby={describedBy} value={fromId} onChange={(e) => { setFrom(e.target.value); }}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {money(a.availableMinor)} available</option>)}
            </Select>
          )}
        </Field>
        <div className="field">
          <span className="field__label" id="to-label">To</span>
          <SegmentedControl label="Send to" value={toMode} onChange={setToMode} options={[{ value: 'own', label: 'My accounts' }, { value: 'person', label: 'Another person' }]} />
        </div>
        {targets.length === 0 ? (
          <p className="info-box">{toMode === 'own' ? 'You have no other accounts yet. Open one, or send to another person.' : 'There is nobody else to send to yet.'}</p>
        ) : (
          <Field label={toMode === 'own' ? 'Your account' : 'Person and account'} helper={toMode === 'own' ? 'Moves money between your own accounts.' : "You'll never see other people's balances."}>
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} value={toId} onChange={(e) => { setTo(e.target.value); }}>
                {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field label="Amount (USD)" helper="Up to 2 decimals · max $1,000,000.00" error={amountError} warning={overWarning}>
          {({ id, describedBy, invalid }) => (
            <AmountInput id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} value={amount} onValueChange={setAmount} onBlur={() => { setTouched(true); }} />
          )}
        </Field>
        <Button type="submit" block disabled={targets.length === 0}>Review transfer</Button>
        <p className="note">Nothing moves until you confirm on the next step.</p>
      </form>

      {phase.kind !== 'form' && fromAccount && (
        <Sheet title={phase.kind === 'success' ? 'Transfer sent' : 'Review transfer'} onClose={phase.kind === 'success' ? done : () => { setPhase({ kind: 'form' }); }} locked={sending}>
          {phase.kind === 'success' ? (
            <div className="success" role="status">
              <span className="success__circle" aria-hidden="true">✓</span>
              <p className="success__amount">Sent {money(phase.amountMinor)}</p>
              <p>to <strong>{toLabel}</strong> from {fromAccount.name}</p>
              {/* Server-reported balance only: until the refresh lands, don't show a stale number. */}
              <p className="success__pill">
                {fromAccount.availableMinor === phase.availableBeforeMinor ? 'Updating balance…' : `${fromAccount.name} now has ${money(fromAccount.availableMinor)} available`}
              </p>
              <Button block onClick={done}>Done</Button>
            </div>
          ) : (
            <div className="review">
              <p className="review__kicker">You're sending</p>
              <p className="review__amount">{money(phase.amountMinor)}</p>
              <dl className="review__dl">
                <div><dt>From</dt><dd>{fromAccount.name}</dd></div>
                <div><dt>To</dt><dd>{toLabel}</dd></div>
                <div><dt>{fromAccount.name} after</dt><dd>{money(fromAccount.availableMinor - phase.amountMinor)} available</dd></div>
              </dl>
              {phase.kind === 'review' && phase.error && (
                <Banner tone="danger" glyph="!" role="alert"><strong>Transfer not sent</strong><br />{phase.error}</Banner>
              )}
              <Button block loading={sending} loadingLabel="Sending…" onClick={() => { void send(phase.amountMinor); }}>Send {money(phase.amountMinor)}</Button>
              <Button variant="secondary" block disabled={sending} onClick={() => { setPhase({ kind: 'form' }); }}>Edit details</Button>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
