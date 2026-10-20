import type { Account, Payment } from '../api';
import { AccountCard } from '../components/AccountCard';
import { BalanceSummary } from '../components/BalanceSummary';
import { Button } from '../components/Button';
import { PendingNotice } from '../components/PendingNotice';
import { DEMO_NOTICE } from './UserSheet';
import './screens.css';

interface Props {
  readonly hidden: boolean;
  readonly accounts: readonly Account[];
  readonly payments: readonly Payment[];
  readonly onOpenAccount: () => void;
  readonly onAccountHistory: (accountId: string) => void;
  readonly onReviewPending: () => void;
  readonly onDevPanel: (() => void) | undefined;
}

export function AccountsScreen({ hidden, accounts, payments, onOpenAccount, onAccountHistory, onReviewPending, onDevPanel }: Props) {
  // Sums of server-reported balances, for display only.
  const available = accounts.reduce((sum, a) => sum + a.availableMinor, 0);
  const reserved = accounts.reduce((sum, a) => sum + a.reservedMinor, 0);
  const pending = payments.filter((p) => p.status === 'UNKNOWN' || p.status === 'PROCESSING');
  return (
    <div className="screen" hidden={hidden}>
      <BalanceSummary availableMinor={available} reservedMinor={reserved} />
      {pending.length > 0 && (
        <PendingNotice count={pending.length} reservedMinor={pending.reduce((s, p) => s + p.amountMinor, 0)} onReview={onReviewPending} />
      )}
      <div className="section-head">
        <h2 className="section-title">Your accounts</h2>
        <Button variant="secondary" onClick={onOpenAccount}>+ Open account</Button>
      </div>
      <div className="cards">
        {accounts.map((a) => <AccountCard key={a.id} account={a} onOpen={() => { onAccountHistory(a.id); }} />)}
      </div>
      <footer className="demo-footer">
        <p>{DEMO_NOTICE}</p>
        {onDevPanel && <button type="button" className="dev-btn" onClick={onDevPanel}>Simulated provider (dev only)</button>}
      </footer>
    </div>
  );
}
