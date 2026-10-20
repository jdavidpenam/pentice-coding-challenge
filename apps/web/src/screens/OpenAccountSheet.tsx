import { useState, type SyntheticEvent } from 'react';
import { api, describeError, type Account } from '../api';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Sheet } from '../components/Sheet';
import './screens.css';

interface Props {
  readonly userId: string;
  readonly accounts: readonly Account[];
  readonly onOpened: (account: Account) => void;
  readonly onClose: () => void;
}

export function OpenAccountSheet({ userId, accounts, onOpened, onClose }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function open(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') { setError('Enter an account name.'); return; }
    if (trimmed.length >= 30) { setError('Keep it under 30 characters.'); return; }
    if (accounts.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) { setError(`You already have an account called “${trimmed}”.`); return; }
    if (saving) return;
    setSaving(true);
    setError(undefined);
    try {
      onOpened(await api.openAccount(userId, trimmed));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Open an account" onClose={onClose} locked={saving}>
      <form className="review" onSubmit={(e) => { void open(e); }} noValidate>
        <Field label="Account name" helper="New accounts start at $0.00." error={error}>
          {({ id, describedBy, invalid }) => (
            <input id={id} className="input" placeholder="e.g. Groceries" value={name} autoComplete="off"
              aria-describedby={describedBy} aria-invalid={invalid || undefined} onChange={(e) => { setName(e.target.value); }} />
          )}
        </Field>
        <Button type="submit" block loading={saving} loadingLabel="Opening…">Open account</Button>
      </form>
    </Sheet>
  );
}
