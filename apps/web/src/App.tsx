import { useEffect, useState } from 'react';
import { api, ApiError, describeError, type Payment, type PublicUser } from './api';
import { AppShell } from './components/AppShell';
import { Banner } from './components/Banner';
import { Button } from './components/Button';
import { DemoUserChip } from './components/DemoUserChip';
import type { TabId } from './components/NavTabs';
import { Toast } from './components/Toast';
import { loadDashboard, type Dashboard } from './dashboard';
import { describeCheck, type CheckResult } from './lib/check';
import { AccountsScreen } from './screens/AccountsScreen';
import { ActivityScreen, type ActivityTab } from './screens/ActivityScreen';
import { DevProviderSheet } from './screens/DevProviderSheet';
import { OpenAccountSheet } from './screens/OpenAccountSheet';
import { PayScreen } from './screens/PayScreen';
import { TransferScreen } from './screens/TransferScreen';
import { DEMO_NOTICE, UserSheet } from './screens/UserSheet';
import { applyTheme, followSystemTheme, type Theme } from './theme';

const TITLES = { accounts: 'Accounts', transfer: 'Transfer', pay: 'Pay for a room', activity: 'Activity' } as const satisfies Record<TabId, string>;
const DEV = import.meta.env.DEV;

export function App() {
  const [users, setUsers] = useState<PublicUser[]>();
  const [usersError, setUsersError] = useState<string>();
  const [userId, setUserId] = useState('');
  const [tab, setTab] = useState<TabId>('accounts');
  const [activityTab, setActivityTab] = useState<ActivityTab>('history');
  const [historyAccountId, setHistoryAccountId] = useState('');
  const [sheet, setSheet] = useState<null | 'user' | 'openAccount' | 'dev'>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [checkResults, setCheckResults] = useState<Record<string, CheckResult>>({});
  const [checkingPaymentId, setCheckingPaymentId] = useState<string | null>(null);
  const [failRefresh, setFailRefresh] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light'));
  const [version, setVersion] = useState(0);
  const refresh = () => { setVersion((v) => v + 1); };

  // Users for the selector. The first user is selected by default (it's a demo identity, not a login).
  const usersKey = String(version);
  useEffect(() => {
    let cancelled = false;
    api.listUsers().then(
      (data) => {
        if (cancelled) return;
        setUsers(data);
        setUsersError(undefined);
        setUserId((current) => current || (data[0]?.id ?? ''));
      },
      (e: unknown) => { if (!cancelled) setUsersError(describeError(e)); },
    );
    return () => { cancelled = true; };
  }, [usersKey]);

  // Everything the acting user may see. A failed refresh keeps the last good data for that user.
  const [dashboard, setDashboard] = useState<{ key: string; data?: Dashboard; error?: string }>();
  const dashboardKey = `${userId}:${version}`;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = failRefresh ? Promise.reject(new ApiError(0, 'SIMULATED', 'Simulated refresh failure.')) : loadDashboard(userId);
    load.then(
      (data) => { if (!cancelled) setDashboard({ key: dashboardKey, data }); },
      (e: unknown) => {
        if (cancelled) return;
        const error = describeError(e);
        setDashboard((prev) => (prev?.data && prev.key.startsWith(`${userId}:`) ? { key: dashboardKey, data: prev.data, error } : { key: dashboardKey, error }));
      },
    );
    return () => { cancelled = true; };
  }, [userId, dashboardKey, failRefresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => { setToast(null); }, 2600);
    return () => { clearTimeout(timer); };
  }, [toast]);

  const current = dashboard && dashboard.key.startsWith(`${userId}:`) ? dashboard : undefined;
  const data = current?.data;
  const actingUser = users?.find((u) => u.id === userId);

  function switchUser(id: string, name: string) {
    setUserId(id);
    setSheet(null);
    setToast(`Now acting as ${name}`);
  }

  async function checkStatus(payment: Payment) {
    if (checkingPaymentId) return;
    setCheckingPaymentId(payment.id);
    try {
      const updated = await api.reconcile(userId, payment.id);
      setCheckResults((prev) => ({ ...prev, [payment.id]: describeCheck(updated) }));
      refresh();
    } catch (e) {
      setCheckResults((prev) => ({ ...prev, [payment.id]: { at: new Date().toISOString(), tone: 'danger', text: describeError(e) } }));
    } finally {
      setCheckingPaymentId(null);
    }
  }

  useEffect(() => followSystemTheme((next) => { applyTheme(next, false); setTheme(next); }), []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
    setTheme(next);
  }

  const themeButton = (
    <Button variant="secondary" className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
      <span className="theme-toggle__text">{theme === 'dark' ? 'Light' : 'Dark'}</span>
    </Button>
  );
  const accountCounts: Record<string, number> = {};
  if (data) {
    accountCounts[userId] = data.accounts.length;
    for (const person of data.directory) accountCounts[person.userId] = person.accounts.length;
  }

  const title = tab === 'accounts' && actingUser ? `Hi, ${actingUser.name}` : TITLES[tab];
  return (
    <>
      <AppShell
        title={title}
        tab={tab}
        onTab={setTab}
        headerRight={
          <div className="header-actions">
            <span className="header-theme">{themeButton}</span>
            <DemoUserChip name={actingUser?.name} onClick={() => { setSheet('user'); }} />
          </div>
        }
        banner={
          <>
            {usersError && <Banner tone="danger" glyph="!" role="alert">{usersError}</Banner>}
            {current?.data && current.error && (
              <Banner tone="warning" glyph="!">
                <span className="refresh-banner">
                  Could not refresh — showing last loaded data.
                  <Button variant="text" onClick={refresh}>Retry</Button>
                </span>
              </Banner>
            )}
          </>
        }
        sideFooter={
          <>
            {DEV && <button type="button" className="dev-btn" onClick={() => { setSheet('dev'); }}>Simulated provider (dev only)</button>}
            <p className="side-notice">{DEMO_NOTICE}</p>
            {themeButton}
          </>
        }
      >
        {!userId || !current ? (
          <p className="empty" role="status">{users?.length === 0 ? 'No users yet. Add one from the demo user menu.' : 'Loading…'}</p>
        ) : !data ? (
          <Banner tone="danger" glyph="!" role="alert">{current.error}</Banner>
        ) : (
          <div key={userId}>
            <AccountsScreen hidden={tab !== 'accounts'} accounts={data.accounts} payments={data.payments}
              onOpenAccount={() => { setSheet('openAccount'); }}
              onAccountHistory={(id) => { setHistoryAccountId(id); setActivityTab('history'); setTab('activity'); }}
              onReviewPending={() => { setActivityTab('payments'); setTab('activity'); }}
              onDevPanel={DEV ? () => { setSheet('dev'); } : undefined} />
            <TransferScreen hidden={tab !== 'transfer'} userId={userId} accounts={data.accounts} directory={data.directory} onChanged={refresh} />
            <PayScreen hidden={tab !== 'pay'} userId={userId} accounts={data.accounts} payments={data.payments}
              checkResults={checkResults} checkingPaymentId={checkingPaymentId} onCheck={(p) => { void checkStatus(p); }}
              onAllPayments={() => { setActivityTab('payments'); setTab('activity'); }} onChanged={refresh} />
            <ActivityScreen hidden={tab !== 'activity'} dashboard={data} tab={activityTab} onTab={setActivityTab}
              historyAccountId={historyAccountId} onHistoryAccount={setHistoryAccountId}
              checkResults={checkResults} checkingPaymentId={checkingPaymentId} onCheck={(p) => { void checkStatus(p); }} />
          </div>
        )}
      </AppShell>

      {sheet === 'user' && users && (
        <UserSheet users={users} actingUserId={userId} accountCounts={accountCounts}
          onSelect={(id) => { switchUser(id, users.find((u) => u.id === id)?.name ?? ''); }}
          onCreated={(u) => { switchUser(u.id, u.name); refresh(); }}
          onClose={() => { setSheet(null); }} />
      )}
      {sheet === 'openAccount' && data && (
        <OpenAccountSheet userId={userId} accounts={data.accounts}
          onOpened={(a) => { setSheet(null); setToast(`Opened “${a.name}”`); refresh(); }}
          onClose={() => { setSheet(null); }} />
      )}
      {DEV && sheet === 'dev' && (
        <DevProviderSheet failRefresh={failRefresh} onFailRefresh={setFailRefresh} onRefreshNow={refresh} onClose={() => { setSheet(null); }} />
      )}
      <Toast message={toast} />
    </>
  );
}
