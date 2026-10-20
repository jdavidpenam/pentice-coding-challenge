Paste the text below into Claude Code from the repo root, after copying this folder to `docs/design_handoff_calm_wallet/`.

---

Implement the "Calm wallet" UI redesign for this Transactions App. The spec lives in `docs/design_handoff_calm_wallet/README.md`, and the tokens are in `docs/design_handoff_calm_wallet/tokens.css`. `CalmWallet.dc.html` is an HTML/JS **reference prototype**. Read it for exact styles, copy and states, but do not port its fake data or money logic.

Constraints:
- **UI layer only.** Do not change backend, money logic, API contracts or tests that cover money behaviour. Wire the new components to the existing API calls and hooks.
- React with **plain CSS** and no component library. Copy `tokens.css` into `src/styles/tokens.css`, import it once, and reference only the CSS variables from it. Put component styles in plain `.css` files next to each component, using class names (BEM-ish).
- Set the theme with `data-theme` on `<html>`. Default to `prefers-color-scheme`, and add a small toggle in the header overflow or the desktop sidebar footer.
- Breakpoints: phone below 700px, with bottom tabs and bottom sheets. Tablet from 700px, with a segmented top nav, 2-column cards and centred dialogs. Desktop from 1100px, with a 248px sidebar, 3-column cards and the history table.

Build these reusable components first: AppShell/NavTabs, DemoUserChip, BalanceSummary (with ReservedBar), AccountCard, PendingNotice, Field, Select, AmountInput, SegmentedControl, Button (with a loading state), StatusBadge, Banner, Toast, Sheet (bottom sheet or dialog, with focus trap and Esc), HistoryTable/ListRow, PaymentRow. Then compose the screens: Accounts, Transfer (form → Review sheet → Sending… → Success/Error), Pay for a room (inline result card), Activity (History/Transfers/Payments), the user switcher sheet, the Open account sheet, and the dev-only Simulated provider sheet (render only when `import.meta.env.DEV`).

Must-haves (each is a review checkpoint):
1. Show this exact demo notice in the user sheet and the Home footer: "Demo only — picking a user is not authentication; payments use a simulated provider, no real money moves." The header chip reads "DEMO USER" above the name.
2. Show reserved money with a hatched pattern **and** the word "Reserved". Never show available and reserved as one number. Include the one-line explainer on Home.
3. Validate amounts with the exact rules and copy in the README (2 decimals, > 0, ≤ $1,000,000.00). Show errors after blur or submit. Linked errors use `aria-describedby` + `aria-invalid`.
4. Prevent double submit: buttons disable and their labels switch to "Sending…" / "Contacting provider…" while in flight.
5. Show the server error "The account does not have enough available funds." in the review sheet or above the Pay button.
6. Use the honest payment outcome copy for Paid, Declined, Unconfirmed and Processing exactly as written in the README. Re-submitting identical pending details must not create a second charge; follow the existing backend idempotency.
7. Keep "Check status" results in state keyed by payment id, so they stay visible after the row re-renders with its new status.
8. Show the non-blocking refresh banner "Could not refresh — showing last loaded data." with Retry, and keep the last loaded data on screen.
9. Accessibility: 44px minimum targets, a visible label on every input, AA contrast, glyph plus word on every status, tabular numbers, and integer-cents formatting via `Intl.NumberFormat`.

Process: first skim the existing components and API hooks and propose a short file plan. Then implement screen by screen. After each screen, run the existing test suite and the dev server, and check 375, 768 and 1280 widths in both themes. Finally, walk through the three provider scenarios in the dev panel (Charge then lose the response, Time out before charging, Decline) and confirm that the UI copy and the Reserved/Available numbers match the README.
