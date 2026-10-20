import type { ReactNode } from 'react';
import { NavTabs, type TabId } from './NavTabs';
import './AppShell.css';

interface Props {
  readonly title: string;
  readonly headerRight: ReactNode;
  readonly banner: ReactNode;
  readonly tab: TabId;
  readonly onTab: (tab: TabId) => void;
  /** Desktop sidebar footer (dev button, demo notice, theme toggle). */
  readonly sideFooter: ReactNode;
  readonly children: ReactNode;
}

/**
 * One DOM, three layouts by CSS: phone (<700) bottom tabs · tablet (700–1099) segmented nav under the header ·
 * desktop (≥1100) 248px sidebar.
 */
export function AppShell({ title, headerRight, banner, tab, onTab, sideFooter, children }: Props) {
  return (
    <div className="shell">
      <aside className="shell__side">
        <div className="shell__brand">
          <span className="shell__brand-mark" aria-hidden="true" />
          Transactions
        </div>
        <NavTabs tab={tab} onTab={onTab} />
        <div className="shell__side-footer">{sideFooter}</div>
      </aside>
      <header className="shell__header">
        <h1 className="shell__title">{title}</h1>
        {headerRight}
      </header>
      <div className="shell__banner">{banner}</div>
      <main className="shell__main">{children}</main>
    </div>
  );
}
