import { useState, type SyntheticEvent } from 'react';
import { api, type Account, type DirectoryEntry } from '../api';
import { formatMinor, parseAmount } from '../money';
import { useSubmit } from '../use-submit';
import { AmountField } from './AmountField';
import { Status } from './Status';

interface Props {
  readonly userId: string;
  readonly accounts: readonly Account[];
  readonly directory: readonly DirectoryEntry[];
  readonly onChanged: () => void;
}

export function TransferForm({ userId, accounts, directory, onChanged }: Props) {
  const [fromAccountId, setFrom] = useState('');
  const [toAccountId, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string>();
  const submit = useSubmit();

  function send(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(amount);
    if (!parsed.ok) {
      setAmountError(parsed.error);
      return;
    }
    setAmountError(undefined);
    void submit.run(async () => {
      await api.transfer(userId, { fromAccountId, toAccountId, amountMinor: parsed.minor });
      setAmount('');
      onChanged();
      return { kind: 'success', message: `Sent ${formatMinor(parsed.minor)}.` };
    });
  }

  const ownTargets = accounts.filter((a) => a.id !== fromAccountId);
  return (
    <section className="card" aria-labelledby="transfer">
      <h2 id="transfer">Transfer</h2>
      <form onSubmit={send} className="stack">
        <label>
          From
          <select
            value={fromAccountId}
            onChange={(e) => {
              setFrom(e.target.value);
              if (e.target.value === toAccountId) setTo('');
            }}
            required
          >
            <option value="">Choose an account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {formatMinor(a.balanceMinor)}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <select value={toAccountId} onChange={(e) => { setTo(e.target.value); }} required>
            <option value="">Choose a recipient…</option>
            {ownTargets.length > 0 && (
              <optgroup label="My accounts">
                {ownTargets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            )}
            {directory.map((person) => (
              <optgroup key={person.userId} label={person.name}>
                {person.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {person.name} · {a.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <AmountField value={amount} onChange={setAmount} error={amountError} />
        <button type="submit" disabled={submit.pending}>
          {submit.pending ? 'Sending…' : 'Send money'}
        </button>
      </form>
      <Status result={submit.result} />
    </section>
  );
}
