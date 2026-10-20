import type { SubmitResult } from '../use-submit';

/** Announces form outcomes to screen readers: errors as alerts, everything else as polite status. */
export function Status({ result }: { result: SubmitResult }) {
  if (!result) return null;
  return result.kind === 'error' ? (
    <p role="alert" className="status error">{result.message}</p>
  ) : (
    <p role="status" className="status success">{result.message}</p>
  );
}
