import type { Payment } from '../api';
import './StatusBadge.css';

export type Tone = 'success' | 'danger' | 'warning' | 'info';

export const STATUS = {
  SUCCEEDED: { label: 'Paid', glyph: '✓', tone: 'success' },
  FAILED: { label: 'Declined', glyph: '✕', tone: 'danger' },
  UNKNOWN: { label: 'Unconfirmed', glyph: '?', tone: 'warning' },
  PROCESSING: { label: 'Processing', glyph: '…', tone: 'info' },
} as const satisfies Record<Payment['status'], { label: string; glyph: string; tone: Tone }>;

/** Glyph AND word, always — status never depends on colour alone. */
export function StatusBadge({ status }: { status: Payment['status'] }) {
  const s = STATUS[status];
  return (
    <span className={`badge tone-${s.tone}`}>
      <span className="badge__glyph" aria-hidden="true">{s.glyph}</span>
      {s.label}
    </span>
  );
}
