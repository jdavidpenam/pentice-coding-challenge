import type { Payment } from '../api';
import { HistoryList, type HistoryRow } from '../components/HistoryList';
import { PaymentRow } from '../components/PaymentRow';
import { SegmentedControl } from '../components/SegmentedControl';
import { accountLabel, type Dashboard } from '../dashboard';
import type { CheckResult } from '../lib/check';
import { delta, money, shortDate } from '../lib/format';
import './screens.css';

export type ActivityTab = 'history' | 'transfers' | 'payments';

interface Props {
  readonly hidden: boolean;
  readonly dashboard: Dashboard;
  readonly tab: ActivityTab;
  readonly onTab: (tab: ActivityTab) => void;
  readonly historyAccountId: string;
  readonly onHistoryAccount: (id: string) => void;
  readonly checkResults: Readonly<Record<string, CheckResult>>;
  readonly checkingPaymentId: string | null;
  readonly onCheck: (payment: Payment) => void;
}

export function ActivityScreen({ hidden, dashboard, tab, onTab, historyAccountId, onHistoryAccount, checkResults, checkingPaymentId, onCheck }: Props) {
  const accountId = dashboard.accounts.some((a) => a.id === historyAccountId) ? historyAccountId : (dashboard.accounts[0]?.id ?? '');
  const own = new Set(dashboard.accounts.map((a) => a.id));
  const nameOf = (id: string) => accountLabel(dashboard, id).replace(/^My /, '');

  function noteFor(referenceId: string): string | undefined {
    const transfer = dashboard.transfers.find((t) => t.id === referenceId);
    if (transfer) return transfer.fromAccountId === accountId ? `To ${nameOf(transfer.toAccountId)}` : `From ${nameOf(transfer.fromAccountId)}`;
    return dashboard.payments.find((p) => p.id === referenceId)?.reference;
  }
  const rows: HistoryRow[] = [...(dashboard.transactions.get(accountId) ?? [])].map((entry) => ({ entry, note: noteFor(entry.referenceId) }));

  return (
    <div className="screen" hidden={hidden}>
      <SegmentedControl kind="tab" label="Activity" value={tab} onChange={onTab}
        options={[{ value: 'history', label: 'History' }, { value: 'transfers', label: 'Transfers' }, { value: 'payments', label: 'Payments' }]} />

      {tab === 'history' && (
        <>
          <div className="chips" role="radiogroup" aria-label="Account">
            {dashboard.accounts.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={a.id === accountId} className="chips__item" onClick={() => { onHistoryAccount(a.id); }}>{a.name}</button>
            ))}
          </div>
          <HistoryList rows={rows} />
        </>
      )}

      {tab === 'transfers' && (dashboard.transfers.length === 0 ? <p className="empty">No transfers yet.</p> : (
        <ul className="list">
          {dashboard.transfers.map((t) => {
            const sent = own.has(t.fromAccountId);
            const received = own.has(t.toAccountId);
            const internal = sent && received;
            return (
              <li key={t.id} className="trow">
                <div className="trow__info">
                  <span className="trow__route">
                    {nameOf(t.fromAccountId)} <span aria-hidden="true">→</span><span className="sr-only"> to </span> {nameOf(t.toAccountId)}
                  </span>
                  <span className="trow__meta">{internal ? 'Between your accounts' : sent ? 'Sent' : 'Received'} · {shortDate(t.createdAt)}</span>
                </div>
                <span className={`trow__amount${!internal && received ? ' trow__amount--in' : ''}`}>
                  {internal ? money(t.amountMinor) : delta(sent ? -t.amountMinor : t.amountMinor)}
                </span>
              </li>
            );
          })}
        </ul>
      ))}

      {tab === 'payments' && (dashboard.payments.length === 0 ? <p className="empty">No payments yet.</p> : (
        <ul className="list">
          {dashboard.payments.map((p) => (
            <PaymentRow key={p.id} payment={p} accountName={nameOf(p.accountId)} checking={checkingPaymentId === p.id}
              anyChecking={checkingPaymentId !== null} result={checkResults[p.id]} onCheck={() => { onCheck(p); }} />
          ))}
        </ul>
      ))}
    </div>
  );
}
