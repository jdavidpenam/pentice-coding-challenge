import { useState, type SyntheticEvent } from 'react';
import { api, type PublicUser } from '../api';
import { useSubmit } from '../use-submit';
import { Status } from './Status';

interface Props {
  readonly users: readonly PublicUser[] | undefined;
  readonly usersError: string | undefined;
  readonly actingUserId: string;
  readonly onSelect: (userId: string) => void;
  readonly onCreated: (userId: string) => void;
}

export function UserBar({ users, usersError, actingUserId, onSelect, onCreated }: Props) {
  const [name, setName] = useState('');
  const submit = useSubmit();

  function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit.run(async () => {
      const { user } = await api.createUser(name);
      setName('');
      onCreated(user.id);
      return { kind: 'success', message: `Created ${user.name} with an empty Main account.` };
    });
  }

  return (
    <section className="card" aria-labelledby="who">
      <h2 id="who">Demo user</h2>
      {usersError && <p role="alert" className="status error">{usersError}</p>}
      <div className="row">
        <label>
          Acting as
          <select value={actingUserId} onChange={(e) => { onSelect(e.target.value); }} disabled={!users}>
            <option value="">{users ? 'Choose a user…' : 'Loading…'}</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <form onSubmit={create} className="row">
          <label>
            New user name
            <input value={name} onChange={(e) => { setName(e.target.value); }} maxLength={50} required />
          </label>
          <button type="submit" disabled={submit.pending}>
            {submit.pending ? 'Creating…' : 'Add user'}
          </button>
        </form>
      </div>
      <Status result={submit.result} />
    </section>
  );
}
