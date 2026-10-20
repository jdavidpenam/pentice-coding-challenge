import { money, splitMoney } from '../lib/format';
import './BalanceSummary.css';

/** Available and reserved are never merged into one number; reserved is shown by pattern AND the word. */
export function BalanceSummary({ availableMinor, reservedMinor }: { availableMinor: number; reservedMinor: number }) {
  const { whole, cents } = splitMoney(availableMinor);
  const total = availableMinor + reservedMinor;
  const reservedPct = total === 0 ? 0 : (reservedMinor / total) * 100;
  return (
    <section className="balance" aria-label="Balance summary">
      <p className="balance__label">Available to spend · all accounts</p>
      <p className="balance__total">
        {whole}
        <span className="balance__cents">{cents}</span>
      </p>
      <ReservedBar reservedPct={reservedPct} hasReserved={reservedMinor > 0} />
      <div className="balance__legend">
        <span><span className="swatch swatch--available" aria-hidden="true" /> Available <strong>{money(availableMinor)}</strong></span>
        <span className="balance__reserved"><span className="swatch swatch--reserved" aria-hidden="true" /> Reserved <strong>{money(reservedMinor)}</strong></span>
      </div>
      <p className="balance__explainer">Reserved is held for hotel payments the provider hasn't confirmed. You can't spend it until it's paid or released.</p>
    </section>
  );
}

function ReservedBar({ reservedPct, hasReserved }: { reservedPct: number; hasReserved: boolean }) {
  return (
    <div className="bar" aria-hidden="true">
      <span className="bar__available" />
      {hasReserved && <span className="bar__reserved" style={{ width: `max(8px, ${reservedPct}%)` }} />}
    </div>
  );
}
