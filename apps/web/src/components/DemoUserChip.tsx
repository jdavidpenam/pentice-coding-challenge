import './DemoUserChip.css';

export function DemoUserChip({ name, onClick }: { name: string | undefined; onClick: () => void }) {
  const label = name ? `Demo user: ${name}. Change who you're acting as.` : 'Choose a demo user.';
  return (
    <button type="button" className="chip" onClick={onClick} aria-label={label} aria-haspopup="dialog">
      <span className="chip__avatar" aria-hidden="true">{name?.charAt(0).toUpperCase() ?? '?'}</span>
      <span className="chip__text" aria-hidden="true">
        <span className="chip__kicker">DEMO USER</span>
        <span className="chip__name">{name ?? 'Choose…'}</span>
      </span>
      <span className="chip__chev" aria-hidden="true">▼</span>
    </button>
  );
}
