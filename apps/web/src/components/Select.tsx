import type { SelectHTMLAttributes } from 'react';
import './Field.css';

/** Native select with the Calm wallet chevron. */
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="select-wrap">
      <select {...props} className="select" />
    </div>
  );
}
