import { money } from '../lib/format';
import { Button } from './Button';
import './PendingNotice.css';

export function PendingNotice({ count, reservedMinor, onReview }: { count: number; reservedMinor: number; onReview: () => void }) {
  return (
    <section className="pending" aria-label="Payments not confirmed">
      <span className="pending__glyph" aria-hidden="true">?</span>
      <div className="pending__text">
        <strong>{count} {count === 1 ? 'payment' : 'payments'} not confirmed yet</strong>
        <span>Waiting on the provider · {money(reservedMinor)} reserved</span>
      </div>
      <Button variant="secondary" onClick={onReview}>Review</Button>
    </section>
  );
}
