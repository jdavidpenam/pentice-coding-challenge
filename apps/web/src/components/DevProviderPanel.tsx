import { useEffect, useState } from 'react';
import { api, describeError, type SimulatorMode } from '../api';

/** Rendered only in `vite dev`. Talks to an API route that exists only when the API runs with DEV_TOOLS=true. */
export function DevProviderPanel() {
  const [mode, setMode] = useState<SimulatorMode>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    api.devProvider().then(
      (state) => { if (!cancelled) setMode(state.mode); },
      (e: unknown) => { if (!cancelled) setError(`Dev tools unavailable: ${describeError(e)}`); },
    );
    return () => { cancelled = true; };
  }, []);

  function change(next: SimulatorMode) {
    api.setDevProviderMode(next).then(
      (state) => { setMode(state.mode); setError(undefined); },
      (e: unknown) => { setError(describeError(e)); },
    );
  }

  return (
    <section className="card dev" aria-labelledby="dev">
      <h2 id="dev">Simulated provider (dev only)</h2>
      {error && <p role="alert" className="status error">{error}</p>}
      {mode && (
        <fieldset>
          <legend>Next payments will be</legend>
          {(['approve', 'decline'] as const).map((m) => (
            <label key={m} className="inline">
              <input type="radio" name="sim-mode" checked={mode === m} onChange={() => { change(m); }} />
              {m === 'approve' ? 'Approved' : 'Declined'}
            </label>
          ))}
        </fieldset>
      )}
    </section>
  );
}
