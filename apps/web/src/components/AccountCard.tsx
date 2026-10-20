import type { Account } from '../api';
import { money } from '../lib/format';
import './AccountCard.css';

export function AccountCard({ account, onOpen }: { account: Account; onOpen: () => void }) {
  const reservedText = account.reservedMinor > 0 ? `Reserved ${money(account.reservedMinor)}` : 'Nothing reserved';
  return (
    <button
      type="button"
      className="acard"
      onClick={onOpen}
      aria-label={`${account.name}: ${money(account.availableMinor)} available, ${reservedText.toLowerCase()}. Open history.`}
    >
      <span className="acard__top">
        <span className="acard__name">{account.name}</span>
        <span className="acard__link">History ›</span>
      </span>
      <span className="acard__label">Available</span>
      <span className="acard__amount">{money(account.availableMinor)}</span>
      {account.reservedMinor > 0 ? (
        <span className="acard__reserved"><span className="swatch swatch--reserved" /> {reservedText}</span>
      ) : (
        <span className="acard__none">{reservedText}</span>
      )}
    </button>
  );
}
