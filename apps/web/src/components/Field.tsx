import { useId, type ReactNode } from 'react';
import './Field.css';

export interface FieldProps {
  readonly label: string;
  readonly helper?: ReactNode;
  readonly error?: string | undefined;
  /** Helper shown in the warning tone (e.g. amount above available). */
  readonly warning?: string | undefined;
  readonly children: (ids: { id: string; describedBy: string; invalid: boolean }) => ReactNode;
}

/** Visible label + control + helper/error, linked with aria-describedby; aria-invalid when there is an error. */
export function Field({ label, helper, error, warning, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-msg`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      {children({ id, describedBy: messageId, invalid: Boolean(error) })}
      <p id={messageId} className={`field__msg${error ? ' field__msg--error' : warning ? ' field__msg--warning' : ''}`}>
        {error ? (
          <>
            <span className="field__err-glyph" aria-hidden="true">!</span>
            {error}
          </>
        ) : (warning ?? helper)}
      </p>
    </div>
  );
}
