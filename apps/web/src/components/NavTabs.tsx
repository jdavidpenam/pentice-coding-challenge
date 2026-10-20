import './NavTabs.css';

export type TabId = 'accounts' | 'transfer' | 'pay' | 'activity';

const TABS = [
  { id: 'accounts', label: 'Accounts', shape: 'rounded' },
  { id: 'transfer', label: 'Transfer', shape: 'circle' },
  { id: 'pay', label: 'Pay', shape: 'diamond' },
  { id: 'activity', label: 'Activity', shape: 'square' },
] as const satisfies readonly { id: TabId; label: string; shape: string }[];

export function NavTabs({ tab, onTab }: { tab: TabId; onTab: (tab: TabId) => void }) {
  return (
    <nav className="nav" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`nav__item${tab === t.id ? ' nav__item--on' : ''}`}
          aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => { onTab(t.id); }}
        >
          <span className="nav__pill" aria-hidden="true"><span className={`nav__icon nav__icon--${t.shape}`} /></span>
          <span className="nav__label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
