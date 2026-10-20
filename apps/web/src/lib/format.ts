/** Display helpers. Inputs are always integer cents; nothing here does money arithmetic. */
const twoDecimals = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MINUS = '−';

/** $1,234.56 · −$1,234.56 */
export function money(minor: number): string {
  const text = twoDecimals.format(Math.abs(minor) / 100);
  return minor < 0 ? `${MINUS}$${text}` : `$${text}`;
}

/** +$12.34 · −$12.34 · — for zero. Signs are explicit so meaning never depends on colour. */
export function delta(minor: number): string {
  if (minor === 0) return '—';
  return `${minor > 0 ? '+' : MINUS}$${twoDecimals.format(Math.abs(minor) / 100)}`;
}

/** Splits "$1,234.56" into "$1,234" and ".56" for the big balance display. */
export function splitMoney(minor: number): { whole: string; cents: string } {
  const [whole = '0', cents = '00'] = twoDecimals.format(minor / 100).split('.');
  return { whole: `$${whole}`, cents: `.${cents}` };
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${clock(iso)}`;
}
