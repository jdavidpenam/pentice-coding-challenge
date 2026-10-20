import { useEffect, useState } from 'react';
import { describeError, api, type PublicUser } from './api';
import { Accounts } from './components/Accounts';
import { Activity } from './components/Activity';
import { DevProviderPanel } from './components/DevProviderPanel';
import { PaymentForm } from './components/PaymentForm';
import { TransferForm } from './components/TransferForm';
import { UserBar } from './components/UserBar';
import { loadDashboard, type Dashboard } from './dashboard';

type Loaded<T> = { readonly key: string; readonly data: T } | { readonly key: string; readonly error: string };

export function App() {
  const [userId, setUserId] = useState('');
  const [version, setVersion] = useState(0);
  const refresh = () => { setVersion((v) => v + 1); };

  const [users, setUsers] = useState<Loaded<PublicUser[]>>();
  const usersKey = String(version);
  useEffect(() => {
    let cancelled = false;
    api.listUsers().then(
      (data) => { if (!cancelled) setUsers({ key: usersKey, data }); },
      (e: unknown) => { if (!cancelled) setUsers({ key: usersKey, error: describeError(e) }); },
    );
    return () => { cancelled = true; };
  }, [usersKey]);

  // `data` is the last good load for this user; `error` is set when the latest load failed.
  const [dashboard, setDashboard] = useState<{ key: string; data?: Dashboard; error?: string }>();
  const dashboardKey = `${userId}:${version}`;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadDashboard(userId).then(
      (data) => { if (!cancelled) setDashboard({ key: dashboardKey, data }); },
      (e: unknown) => {
        if (cancelled) return;
        const error = describeError(e);
        // A failed refresh keeps the last good data for the same user visible, with the error shown above it.
        setDashboard((prev) => (prev?.data && prev.key.startsWith(`${userId}:`) ? { key: dashboardKey, data: prev.data, error } : { key: dashboardKey, error }));
      },
    );
    return () => { cancelled = true; };
  }, [userId, dashboardKey]);

  // Keep showing the previous data while a refresh is in flight, but never another user's data.
  const current = dashboard && dashboard.key.startsWith(`${userId}:`) ? dashboard : undefined;
  const refreshing = current !== undefined && current.key !== dashboardKey;

  return (
    <>
      <header>
        <h1>Transactions App</h1>
        <p className="notice" role="note">
          <strong>Demo only.</strong> Picking a user is <em>not</em> authentication — anyone can act as anyone.
          Payments use a simulated provider; no real money moves.
        </p>
      </header>
      <main>
        <UserBar
          users={users && 'data' in users ? users.data : undefined}
          usersError={users && 'error' in users ? users.error : undefined}
          actingUserId={userId}
          onSelect={setUserId}
          onCreated={(id) => { setUserId(id); refresh(); }}
        />
        {!userId ? (
          <p className="card">Choose a demo user to see their accounts.</p>
        ) : !current ? (
          <p className="card" role="status">Loading…</p>
        ) : !current.data ? (
          <p className="card status error" role="alert">{current.error}</p>
        ) : (
          <div className="grid" aria-busy={refreshing}>
            {current.error && (
              <p className="card wide status error" role="alert">
                Could not refresh: {current.error} Showing the last loaded data.
              </p>
            )}
            <Accounts userId={userId} accounts={current.data.accounts} onChanged={refresh} />
            <TransferForm userId={userId} accounts={current.data.accounts} directory={current.data.directory} onChanged={refresh} />
            <PaymentForm userId={userId} accounts={current.data.accounts} onChanged={refresh} />
            <Activity userId={userId} dashboard={current.data} onChanged={refresh} />
          </div>
        )}
        {import.meta.env.DEV && <DevProviderPanel />}
      </main>
    </>
  );
}
