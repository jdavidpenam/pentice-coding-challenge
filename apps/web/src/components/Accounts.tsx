import { useState, type SyntheticEvent } from 'react';
import { api, type Account } from '../api';
import { formatMinor } from '../money';
import { useSubmit } from '../use-submit';
import { Status } from './Status';

interface Props {
  readonly userId: string;
  readonly accounts: readonly Account[];
  readonly onChanged: () => void;
}

export function Accounts({ userId, accounts, onChanged }: Props) {
  const [name, setName] = useState('');
  const submit = useSubmit();

  function open(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit.run(async () => {
      const account = await api.openAccount(userId, name);
      setName('');
      onChanged();
      return { kind: 'success', message: `Opened ${account.name}.` };
    });
  }

  return (
    <section className="card" aria-labelledby="accounts">
      <h2 id="accounts">My accounts</h2>
      {accounts.length === 0 ? (
        <p>No accounts yet.</p>
      ) : (
        <div className="scroll">
        <table className="accounts">
          <caption className="hint">Amounts in USD. Reserved = held for payments not yet confirmed.</caption>
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col" className="num">Available</th>
              <th scope="col" className="num">Reserved</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td className="num">{formatMinor(a.availableMinor)}</td>
                <td className="num" title="Held for payments the provider has not confirmed yet">{formatMinor(a.reservedMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <form onSubmit={open} className="row">
        <label>
          New account name
          <input value={name} onChange={(e) => { setName(e.target.value); }} maxLength={50} required />
        </label>
        <button type="submit" disabled={submit.pending}>
          {submit.pending ? 'Opening…' : 'Open account'}
        </button>
      </form>
      <Status result={submit.result} />
    </section>
  );
}
