import type { LedgerEntry, LedgerEntryKind } from '../api';
import { delta, money, shortDate } from '../lib/format';
import './HistoryList.css';

const KIND = {
  SEED: 'Demo funding',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
  PAYMENT_RESERVE: 'Payment reserved',
  PAYMENT_CAPTURE: 'Payment sent',
  PAYMENT_RELEASE: 'Reservation released',
} as const satisfies Record<LedgerEntryKind, string>;

export interface HistoryRow {
  readonly entry: LedgerEntry;
  readonly note: string | undefined;
}

/** Phone: stacked list rows. ≥700px: a 5-column table. Signs are explicit, so meaning never depends on colour. */
export function HistoryList({ rows }: { rows: readonly HistoryRow[] }) {
  if (rows.length === 0) return <p className="empty">No history yet for this account.</p>;
  return (
    <div className="hist" role="table" aria-label="Account history">
      <div className="hist__head" role="row">
        <span role="columnheader">Date</span>
        <span role="columnheader">Type</span>
        <span role="columnheader" className="hist__num">Available</span>
        <span role="columnheader" className="hist__num">Reserved</span>
        <span role="columnheader" className="hist__num">Available after</span>
      </div>
      {rows.map(({ entry, note }) => (
        <div className="hist__row" role="row" key={entry.id}>
          <span role="cell" className="hist__date">{shortDate(entry.createdAt)}</span>
          <span role="cell" className="hist__type">
            <span className="hist__kind">{KIND[entry.kind]}</span>
            {note && <span className="hist__note">{note}</span>}
          </span>
          <span role="cell" className={`hist__num hist__avail${entry.availableDeltaMinor > 0 ? ' hist__avail--in' : ''}`}>
            <span className="hist__mlabel">Available </span>{delta(entry.availableDeltaMinor)}
          </span>
          <span role="cell" className={`hist__num hist__res${entry.reservedDeltaMinor === 0 ? ' hist__res--zero' : ''}`}>
            <span className="hist__mlabel">Reserved </span>{delta(entry.reservedDeltaMinor)}
          </span>
          <span role="cell" className="hist__num hist__after">
            <span className="hist__mlabel">After </span>{money(entry.availableAfterMinor)}
          </span>
        </div>
      ))}
    </div>
  );
}
