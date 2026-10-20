import { useState } from 'react';
import type { LedgerEntryKind } from '../api';
import { accountLabel, type Dashboard } from '../dashboard';
import { formatMinor } from '../money';
import { describePayment } from './PaymentForm';

const KIND_LABEL = {
  SEED: 'Demo funding',
  TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer in',
  PAYMENT_HOLD: 'Payment',
  PAYMENT_RELEASE: 'Payment returned',
} as const satisfies Record<LedgerEntryKind, string>;

const time = (iso: string) => new Date(iso).toLocaleString();

export function Activity({ dashboard }: { dashboard: Dashboard }) {
  const [selected, setSelected] = useState('');
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
                <th scope="col" className="num">Amount</th>
                <th scope="col" className="num">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{time(e.createdAt)}</td>
                  <td>{KIND_LABEL[e.kind]}</td>
                  <td className={`num ${e.amountMinor < 0 ? 'out' : 'in'}`}>{formatMinor(e.amountMinor)}</td>
                  <td className="num">{formatMinor(e.balanceAfterMinor)}</td>
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
                      {p.status}
                    </span>
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
