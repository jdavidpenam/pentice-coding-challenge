import type { ReactNode } from 'react';
import type { Tone } from './StatusBadge';
import './Banner.css';

/** Inline message box. `role` defaults to status (polite); use "alert" for errors that block an action. */
export function Banner({ tone, glyph, role = 'status', children }: { tone: Tone; glyph: string; role?: 'status' | 'alert'; children: ReactNode }) {
  return (
    <div className={`banner tone-${tone}`} role={role}>
      <span className="banner__glyph" aria-hidden="true">{glyph}</span>
      <div className="banner__body">{children}</div>
    </div>
  );
}
