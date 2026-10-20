import { useEffect, useId, useRef, type ReactNode } from 'react';
import './Sheet.css';

interface Props {
  readonly title: string;
  readonly onClose: () => void;
  /** While true (a request is in flight) Esc, the scrim and the close button are ignored. */
  readonly locked?: boolean;
  readonly children: ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

/** Bottom sheet below 700px, centred dialog above. Traps focus, closes on Esc, returns focus to the trigger. */
export function Sheet({ title, onClose, locked = false, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // The key handler is registered once; it reads the latest props through this ref.
  const latest = useRef({ onClose, locked });
  useEffect(() => { latest.current = { onClose, locked }; });

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && !latest.current.locked) latest.current.onClose();
      if (event.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      trigger?.focus();
    };
  }, []);

  return (
    <div className="sheet">
      <div className="sheet__scrim" onClick={() => { if (!locked) onClose(); }} aria-hidden="true" />
      <div className="sheet__panel" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel}>
        <div className="sheet__handle" aria-hidden="true" />
        <div className="sheet__head">
          <h2 id={titleId} className="sheet__title">{title}</h2>
          <button type="button" className="sheet__close" onClick={onClose} disabled={locked} aria-label="Close">✕</button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}
