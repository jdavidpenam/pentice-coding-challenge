import { useState, type SyntheticEvent } from 'react';
import { api, describeError, type PublicUser } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Sheet } from '../components/Sheet';
import './screens.css';

export const DEMO_NOTICE = 'Demo only — picking a user is not authentication; payments use a simulated provider, no real money moves.';

interface Props {
  readonly users: readonly PublicUser[];
  readonly actingUserId: string;
  /** Account counts from the user's own accounts and the recipient directory (names/IDs only, never balances). */
  readonly accountCounts: Readonly<Record<string, number>>;
  readonly onSelect: (userId: string) => void;
  readonly onCreated: (user: PublicUser) => void;
  readonly onClose: () => void;
}

export function UserSheet({ users, actingUserId, accountCounts, onSelect, onCreated, onClose }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function add(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') { setError('Enter a name.'); return; }
    if (users.some((u) => u.name.toLowerCase() === trimmed.toLowerCase())) { setError('That name is already taken.'); return; }
    if (saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const { user } = await api.createUser(trimmed);
      onCreated(user);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Who are you acting as?" onClose={onClose} locked={saving}>
      <Banner tone="warning" glyph="i"><strong>{DEMO_NOTICE}</strong></Banner>
      <div className="users" role="radiogroup" aria-label="Demo users">
        {users.map((u) => (
          <button key={u.id} type="button" role="radio" aria-checked={u.id === actingUserId} className="users__row" onClick={() => { onSelect(u.id); }}>
            <span className="chip__avatar" aria-hidden="true">{u.name.charAt(0).toUpperCase()}</span>
            <span className="users__info">
              <span>{u.name}</span>
              {accountCounts[u.id] !== undefined && <span className="users__meta">{accountCounts[u.id]} {accountCounts[u.id] === 1 ? 'account' : 'accounts'}</span>}
            </span>
            <span className="users__dot" aria-hidden="true" />
          </button>
        ))}
      </div>
      <form onSubmit={(e) => { void add(e); }} noValidate>
        <Field label="Add a new user" helper="Starts with one empty “Main” account." error={error}>
          {({ id, describedBy, invalid }) => (
            <div className="inline-form">
              <input id={id} className="input" placeholder="Name" value={name} maxLength={50} autoComplete="off"
                aria-describedby={describedBy} aria-invalid={invalid || undefined} onChange={(e) => { setName(e.target.value); }} />
              <Button type="submit" variant="ink" loading={saving} loadingLabel="Adding…">Add</Button>
            </div>
          )}
        </Field>
      </form>
    </Sheet>
  );
}
