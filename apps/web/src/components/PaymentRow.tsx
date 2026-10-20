import type { Payment } from '../api';
import { checkedLabel, type CheckResult } from '../lib/check';
import { money, shortDate } from '../lib/format';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import './PaymentRow.css';

interface Props {
  readonly payment: Payment;
  readonly accountName: string;
  readonly checking: boolean;
  readonly anyChecking: boolean;
  readonly result: CheckResult | undefined;
  readonly onCheck: () => void;
}

export function PaymentRow({ payment, accountName, checking, anyChecking, result, onCheck }: Props) {
  const pending = payment.status === 'UNKNOWN' || payment.status === 'PROCESSING';
  return (
    <li className="prow">
      <div className="prow__main">
        <div className="prow__info">
          <span className="prow__ref">{payment.reference}</span>
          <span className="prow__meta">{accountName} · {shortDate(payment.createdAt)}</span>
        </div>
        <div className="prow__side">
          <span className="prow__amount">{money(payment.amountMinor)}</span>
          <StatusBadge status={payment.status} />
        </div>
      </div>
      {pending && (
        <Button variant="secondary" loading={checking} loadingLabel="Checking…" disabled={anyChecking} onClick={onCheck}
          aria-label={checking ? undefined : `Check status of ${payment.reference}`}>
          Check status
        </Button>
      )}
      {result && (
        <p className={`prow__result tone-${result.tone}`} role="status">
          <strong>{checkedLabel(result)}</strong> — {result.text}
        </p>
      )}
    </li>
  );
}
