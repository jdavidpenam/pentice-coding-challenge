import { useState } from 'react';
import { api, type LedgerEntryKind, type Payment } from '../api';
import { accountLabel, type Dashboard } from '../dashboard';
import { formatMinor } from '../money';
import { useSubmit } from '../use-submit';
import { describePayment } from './PaymentForm';
import { Status } from './Status';

const KIND_LABEL = {
  SEED: 'Demo funding',
  TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer in',
  PAYMENT_RESERVE: 'Payment reserved',
  PAYMENT_RELEASE: 'Reservation released',
  PAYMENT_CAPTURE: 'Payment sent',
} as const satisfies Record<LedgerEntryKind, string>;

const time = (iso: string) => new Date(iso).toLocaleString();

const STATUS_LABEL = {
  PROCESSING: 'Processing',
  UNKNOWN: 'Unconfirmed',
  SUCCEEDED: 'Paid',
  FAILED: 'Declined',
} as const satisfies Record<Payment['status'], string>;

interface Props {
  readonly userId: string;
  readonly dashboard: Dashboard;
  readonly onChanged: () => void;
}

export function Activity({ userId, dashboard, onChanged }: Props) {
  const [selected, setSelected] = useState('');
  // Lives here, not in the row, so the outcome stays visible after the row's button disappears.
  const check = useSubmit();

  /** Asks the backend to reconcile this payment with the provider. Same payment ID every time; safe to repeat. */
  function checkStatus(payment: Payment) {
    void check.run(async () => {
      const updated = await api.reconcile(userId, payment.id);
      onChanged();
      return { kind: updated.status === 'SUCCEEDED' ? 'success' : 'error', message: `${payment.reference}: ${describePayment(updated)}` };
    });
  }
  const accountId = dashboard.accounts.some((a) => a.id === selected) ? selected : (dashboard.accounts[0]?.id ?? '');
  const entries = dashboard.transactions.get(accountId) ?? [];

  return (
    <section className="card wide" aria-labelledby="activity">
      <h2 id="activity">Activity</h2>

      <h3>Account history</h3>
      <label>
        Account
        <select value={accountId} onChange={(e) => { setSelected(e.target.value); }}>
          {dashboard.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {entries.length === 0 ? (
        <p>No entries yet.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What</th>
                <th scope="col" className="num">Available</th>
                <th scope="col" className="num">Reserved</th>
                <th scope="col" className="num">Available after</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{time(e.createdAt)}</td>
                  <td>{KIND_LABEL[e.kind]}</td>
                  <td className={`num ${e.availableDeltaMinor < 0 ? 'out' : 'in'}`}>{e.availableDeltaMinor === 0 ? '—' : formatMinor(e.availableDeltaMinor)}</td>
                  <td className="num">{e.reservedDeltaMinor === 0 ? '—' : formatMinor(e.reservedDeltaMinor)}</td>
                  <td className="num">{formatMinor(e.availableAfterMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Transfers</h3>
      {dashboard.transfers.length === 0 ? (
        <p>No transfers yet.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col" className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.transfers.map((t) => (
                <tr key={t.id}>
                  <td>{time(t.createdAt)}</td>
                  <td>{accountLabel(dashboard, t.fromAccountId)}</td>
                  <td>{accountLabel(dashboard, t.toAccountId)}</td>
                  <td className="num">{formatMinor(t.amountMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Payments</h3>
      <Status result={check.result} />
      {dashboard.payments.length === 0 ? (
        <p>No payments yet.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Reference</th>
                <th scope="col">From</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.payments.map((p) => (
                <tr key={p.id}>
                  <td>{time(p.createdAt)}</td>
                  <td>{p.reference}</td>
                  <td>{accountLabel(dashboard, p.accountId)}</td>
                  <td className="num">{formatMinor(p.amountMinor)}</td>
                  <td>
                    <span className={`badge ${p.status.toLowerCase()}`} title={describePayment(p)}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="action">
                    {p.status === 'UNKNOWN' || p.status === 'PROCESSING' ? (
                      <button
                        type="button"
                        disabled={check.pending}
                        aria-label={`Check status of payment ${p.reference}`}
                        onClick={() => { checkStatus(p); }}
                      >
                        {check.pending ? 'Checking…' : 'Check status'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
