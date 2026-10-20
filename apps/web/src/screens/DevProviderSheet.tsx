import { useEffect, useState } from 'react';
import { api, describeError, SIMULATOR_MODES, type SimulatorMode } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import './screens.css';

const MODES = {
  approve: { title: 'Approve', description: 'Provider charges and confirms.' },
  decline: { title: 'Decline', description: 'Provider refuses; reserved money returns.' },
  charge_then_timeout: { title: 'Charge, then lose the response', description: 'Charged, but no reply reaches us → Unconfirmed.' },
  timeout_before_charge: { title: 'Time out before charging', description: 'Nothing charged; stays unresolved while on.' },
} as const satisfies Record<SimulatorMode, { title: string; description: string }>;

interface Props {
  readonly failRefresh: boolean;
  readonly onFailRefresh: (on: boolean) => void;
  readonly onRefreshNow: () => void;
  readonly onClose: () => void;
}

/** Dev builds only. Changes how the simulated provider answers; never touches balances directly. */
export function DevProviderSheet({ failRefresh, onFailRefresh, onRefreshNow, onClose }: Props) {
  const [mode, setMode] = useState<SimulatorMode>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    api.devProvider().then(
      (s) => { if (!cancelled) setMode(s.mode); },
      (e: unknown) => { if (!cancelled) setError(`Dev tools unavailable: ${describeError(e)}`); },
    );
    return () => { cancelled = true; };
  }, []);

  function choose(next: SimulatorMode) {
    api.setDevProviderMode(next).then((s) => { setMode(s.mode); setError(undefined); }, (e: unknown) => { setError(describeError(e)); });
  }

  return (
    <Sheet title="Simulated provider" onClose={onClose}>
      <p className="users__meta">Only in dev builds. Controls how the simulated provider answers the next payment or status check.</p>
      {error && <Banner tone="danger" glyph="!" role="alert">{error}</Banner>}
      <div className="users" role="radiogroup" aria-label="Provider behaviour">
        {SIMULATOR_MODES.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className="users__row" disabled={mode === undefined} onClick={() => { choose(m); }}>
            <span className="users__info"><span>{MODES[m].title}</span><span className="users__meta">{MODES[m].description}</span></span>
            <span className="users__dot" aria-hidden="true" />
          </button>
        ))}
      </div>
      <button type="button" role="switch" aria-checked={failRefresh} className="switch" onClick={() => { onFailRefresh(!failRefresh); }}>
        <span className="users__info"><span>Fail data refresh</span><span className="users__meta">Shows the non-blocking “last loaded data” banner.</span></span>
        <span className="switch__track" aria-hidden="true" />
      </button>
      <Button variant="secondary" block onClick={onRefreshNow}>Refresh data now</Button>
    </Sheet>
  );
}
