# Handoff: Transactions App — "Calm wallet" UI

## Overview
This is a new UI for the Transactions App coding-assessment project. A guest holds money in wallet accounts, moves money to themselves or to other people, and pays for a hotel room through a simulated payment provider. **The money logic already exists in the codebase.** This handoff covers only the UI and UX layer: layout, components, states and copy.

## About the design files
The files in this folder are **design references built in HTML**. They are interactive prototypes that show the intended look and behaviour. They are not production code.

Recreate the UI in the existing **React + plain CSS** app, using the app's own API calls and state. There is no component library. Do not port the prototype's fake money logic (`seed()`, `payApply()` and so on); wire the UI to the real endpoints.

- `CalmWallet.dc.html` is the full interactive prototype. Open it in a browser next to `support.js`.
- `Calm Wallet Gallery.dc.html` shows every key state at 375, 768 and 1280, in light and dark, plus the tokens and components sheet.
- `tokens.css` holds the tokens, ready to drop into the app.

## Fidelity
**High-fidelity.** Colours, type, spacing, radii, copy and states are final. Match them closely.

---

## Global layout and responsive behaviour
There are three layouts, switched by CSS media queries:

| Width | Navigation | Content | Sheets |
|---|---|---|---|
| < 700px (design at 375) | **Bottom tab bar** (4 items) fixed at bottom | single column, padding `4px 16px 24px` | bottom sheet, radius `24px 24px 0 0`, grab handle |
| 700–1099 (design at 768) | **segmented tab bar** under header, max-width 680, centred | max-width 680, padding `8px 28px 32px`; account cards in 2 columns | centred dialog, 440px wide, radius 24 |
| ≥ 1100 (design at 1280) | **left sidebar** 248px, surface bg, right border `--line` | max-width 1040, padding `8px 40px 40px`; cards in 3 columns; history as table | centred dialog 440px |

App shell: `height: 100dvh; display:flex; flex-direction: column` (phone and tablet) or `row` (desktop). Header and nav are `flex:none`. `<main>` is `flex:1; overflow-y:auto`.

**Header:** page title on the left (24px/700 on phone, 28px from 700px up; on phone the Accounts tab says "Hi, {name}"). The demo-user chip sits on the right. Header padding is `14px 16px 10px` on phone, `22px 28px 14px` on tablet and `28px 40px 16px` on desktop.

**Navigation items:** Accounts · Transfer · Pay · Activity. Each icon is a 12–13px outlined CSS shape: rounded square, circle, diamond (a square rotated 45°), and square. Real icons can replace these later.
- **Phone tab:** 54px min-height. The icon sits in a 44×28 pill that turns `--accent-soft` when active, with a 12px/600 label. Active colour is `--accent-ink`, inactive is `--ink-2`. Set `aria-current="page"` on the active tab.
- **Tablet segmented control:** container `--surface-2`, radius 16, padding 4. Each item is 44px high with radius 12. The active item gets a `--surface` background and `0 1px 3px rgba(0,0,0,.12)`.
- **Desktop sidebar:** items are 48px high with radius 14; the active item gets an `--accent-soft` background and `--accent-ink` text. At the top is the brand: a 28px rounded square in `--accent` plus "Transactions" at 17/700. At the bottom are the "Simulated provider (dev only)" dashed button and the demo notice at 12px.

---

## Screens

### 1. Accounts (home)
1. **Balance summary card.** `--surface`, 1px `--line`, `--shadow-card`, radius 24, padding 22, gap 14.
   - Label: "Available to spend · all accounts" at 13/600 in `--ink-2`.
   - Total available at 44px/700 (56px from 700px up), letter-spacing −0.025em, line-height 1. The **cents are split out** at 28px (34px) in `--ink-2`.
   - Bar: 10px high, radius 99, `--surface-2` track. The available segment is `--accent`. The reserved segment is `--hatch-reserved`, at least 8px wide whenever reserved > 0, with a 2px `--surface` left border as a divider. The bar is `aria-hidden`.
   - Legend row: a solid swatch with "Available **$X**", then a hatched swatch with "Reserved **$Y**" in `--warning-fg`. Swatches are 12px with radius 4.
   - Explainer (13.5px, `--ink-2`): "Reserved is held for hotel payments the provider hasn't confirmed. You can't spend it until it's paid or released."
2. **Pending payments card.** Shown only when the user has Processing or Unconfirmed payments.
   - `--warning-bg`, radius 18. A 30px circle outlined in `--warning-fg` holds "?".
   - Text: "**{n} payment(s) not confirmed yet**" then "Waiting on the provider · $X reserved".
   - Outlined **Review** button (44px) goes to Activity → Payments.
3. **"Your accounts" heading** (17/700), with a secondary **+ Open account** button on the right (44px, 1.5px `--line-strong`, radius 12).
4. **Account cards grid.** 1, 2 or 3 columns, gap 12. Each card is a `<button>`: padding 18, radius 20, `--surface`, 1px `--line`.
   - Top row: name (16/700) and "History ›" (13/600, `--accent-ink`).
   - "Available" (12/600 `--ink-2`), then the amount at 28/700.
   - Reserved row: hatched swatch plus "Reserved $X" in `--warning-fg`, or "Nothing reserved" in `--ink-2`.
   - Use an aria-label that reads the full sentence.
   - Clicking a card goes to Activity → History for that account.
5. **Demo footer** (phone and tablet only). 1.5px dashed `--line-strong`, radius 16. Contains the full demo notice plus a "Simulated provider (dev only)" button that opens the dev sheet.

### 2. Transfer
A form card with max-width 560, centred: `--surface`, radius 24, padding 22, gap 20.
- **From.** Label "From" (14/700). Native `<select>`, 52px, radius 14, 1.5px `--line-strong`, `appearance:none`, with a ▼ chevron at right 16. Options read "Main — $1,240.50 available".
  - Helper text: "$240.00 is reserved and can't be sent." when the account has reserved money, otherwise "Only available money can be sent."
- **To.** Label "To", then a segmented radiogroup: **My accounts | Another person**. Below it, a select listing only that group.
  - My accounts excludes the From account.
  - Other people appear as "Bob · Main".
  - Helper text: "You'll never see other people's balances." for people, or "Moves money between your own accounts." for your own.
  - If the user has no other accounts, show an info box instead: "You have no other accounts yet. Open one, or send to another person."
- **Amount (USD).**
  - Input: 64px high, radius 16, 2px `--line-strong` border, value at 28/700 tabular.
  - A "$" sits absolutely positioned at left 16 (26/700 `--ink-2`); input padding-left is 40.
  - Attributes: `inputMode="decimal"`, `placeholder="0.00"`, `aria-describedby` pointing at the helper text.
  - Strip any character that isn't a digit, "." or ",".
  - Helper text in its default state: "Up to 2 decimals · max $1,000,000.00".
  - **Warning state** (amount > available): "That's more than Main's $1,240.50 available." in `--warning-fg` at 600.
  - **Error state** (after blur or submit): the border turns `--danger-fg`, the input gets `aria-invalid`, and the message shows a 16px filled "!" circle plus 600 text in `--danger-fg`.
- **Primary button "Review transfer"** (54px, radius 16, `--accent`, 16/700), then the note "Nothing moves until you confirm on the next step." (12.5px, centred).

**Review sheet** (title "Review transfer"):
- Centred: "You're sending" (13/600 `--ink-2`), then the amount at 44/700.
- A `<dl>` box on `--surface-2` with radius 16 and rows From / To / "{From} after" (the after-balance shows "$X available").
- **Send $12.34** primary button. While the request is in flight it is **disabled**, reads "Sending…", and switches to `--disabled-bg` / `--disabled-fg`. Close, Edit and the scrim are all ignored while sending.
- **Edit details** secondary button (48px, 1.5px `--line-strong`).
- **Error** (server returns insufficient funds): a `role="alert"` box above the buttons on `--danger-bg` with a "!" circle, "**Transfer not sent**", then the server message "The account does not have enough available funds."

**Success** (sheet title "Transfer sent", `role="status"`):
- A 64px circle on `--success-bg` with ✓.
- "Sent $12.34" at 30/700.
- "to **Bob · Main** from Main".
- A pill reading "Main now has $1,228.16 available".
- A **Done** button closes the sheet and clears the amount.

### 3. Pay for a room
A form card (same shell as Transfer) with fields in this order:
1. **Pay from**: select, with helper "$X available in Main".
2. **Booking reference**: text input, 52px, placeholder "Room 204 #BK-1029". If it's empty on submit: "Enter the booking reference from your hotel."
3. **Amount (USD)**: same amount input as Transfer. Helper: "The amount on your booking, in USD."

Below the fields:
- A server error box when needed (same style as Transfer).
- Primary button: "Pay $120.00" (or "Pay" when no amount yet). While in flight it is disabled and reads "Contacting provider…".
- Subtle note: "No card details needed — paid from your wallet through a simulated provider."

**Result card** (stays below the form, `role="status" aria-live="polite"`):
- Background is the tone's bg, with a 1.5px border in the tone's fg and radius 24.
- Contains the badge, amount (22/700), reference (16/700), body copy, a Check status button (Processing and Unconfirmed only), and **All payments** (goes to Activity → Payments).

Body copy by outcome:
- **Paid** (success): "Paid from Main. It's in your payments as Paid."
- **Declined** (danger): "The provider declined this payment. $X is back in Available in Main."
- **Unconfirmed** (warning): "The provider didn't reply, so we don't know yet if it charged. $X is held in Reserved — not lost. Check status, or pay again with the same details; you won't be charged twice."
- **Processing** (info): "The provider hasn't charged yet. $X is held in Reserved until it does, or releases it."
- **Re-submitting identical details** (same account, reference and amount while still pending) **must not create a new charge.** Run a status check instead and add this line: "You already had this payment in progress, so we checked its status instead of charging again." Confirm the backend's idempotency behaviour and match the copy to it.
- After a check, add "Checked 20:14 — {result}" at 13/600.

### 4. Activity
A segmented tablist with **History | Transfers | Payments** (styled like the To segmented control).
- **History:**
  - A horizontal row of account chips (radiogroup). Each chip is 44px, a pill, with a 1.5px border. The selected chip is filled `--ink` with text in `--bg`.
  - A list in a `--surface` card with radius 20.
  - **Phone rows:**
    - Left column: type (600), date, and note ("Room 204 #BK-1029", "To Savings"), each at 12.5px in `--ink-2`.
    - Right column: available change (700; `--success-fg` when positive), then "Reserved +$180.00" (12.5/600 `--warning-fg`, only when non-zero), then "After $1,300.50".
  - **700px and up:** a 5-column grid table, `130px | 1.6fr | 1fr | 1fr | 1fr`: Date · Type (with note) · Available · Reserved · Available after. The header is 12/700 uppercase `--ink-2`, letter-spacing .05em, and rows are at least 56px.
  - Signs are always explicit (+$, −$, — for zero), so meaning never depends on colour.
  - Types: Demo funding, Transfer in, Transfer out, Payment reserved, Payment sent, Reservation released.
- **Transfers:**
  - Rows read "Main → Bob · Main". The arrow is `aria-hidden`; add visually hidden " to " text for screen readers.
  - Meta line: "Sent", "Received" or "Between your accounts", plus the date.
  - Amount: signed for Sent and Received (Received in `--success-fg`), unsigned for internal moves.
- **Payments:**
  - One card per payment: radius 18, padding `14px 16px`.
  - Contents: reference (700); account · date; then on the right the amount and the **status badge**.
  - Pending rows get a **Check status** secondary button (44px), which reads "Checking…" and is disabled while running.
  - **The check result must stay visible after the row updates.** Store `{at, text, tone}` on the payment record in client state, keyed by payment id, not in the row component. Render it as a `role="status"` box on the tone's bg: "**Checked 20:14** — the provider confirmed the charge. $180.00 left Reserved as a payment."
  - Other result texts: "still waiting on the provider. Nothing changed; try again later." (warning) and "the provider declined. $X is back in Available." (danger).

### 5. Demo user switcher (sheet "Who are you acting as?")
Opened from the header chip. The chip is 44px min, a pill, `--surface` with 1px `--line`. It holds a 36px avatar circle (`--accent-soft` bg, `--accent-ink` initial), a stacked label "DEMO USER" (10.5/700, .08em, `--warning-fg`) over the name (15/600), and ▼. Its aria-label is "Demo user: Alice. Change who you're acting as."

Sheet contents:
- Notice box on `--warning-bg` with an "i" circle: **"Demo only — picking a user is not authentication; payments use a simulated provider, no real money moves."**
- Radiogroup of users. Each row is 56px with radius 14 and shows avatar, name and "3 accounts", with a radio dot on the right. The selected row gets an `--accent` border and `--accent-soft` bg.
- Add user form: label "Add a new user", a Name input plus an **Add** button (`--ink` bg).
  - Helper: "Starts with one empty “Main” account."
  - Errors: "Enter a name." and "That name is already taken."
  - On success: switch to the new user and show the toast "Now acting as {name}".
- Switching user resets both forms and shows the same toast.

### 6. Open account (sheet "Open an account")
- Label "Account name", placeholder "e.g. Groceries", helper "New accounts start at $0.00."
- Errors: "Enter an account name." · "Keep it under 30 characters." · "You already have an account called “X”."
- On success, close the sheet and show the toast "Opened “X”".

### 7. Developer panel (dev builds only, `import.meta.env.DEV`)
A sheet titled "Simulated provider", opened from the dashed buttons.
- Intro: "Only in dev builds. Controls how the simulated provider answers the next payment or status check."
- Radiogroup with 56px rows (title and description):
  - Approve: "Provider charges and confirms."
  - Decline: "Provider refuses; reserved money returns."
  - Charge, then lose the response: "Charged, but no reply reaches us → Unconfirmed."
  - Time out before charging: "Nothing charged; stays unresolved while on."
  - Map these to your existing dev endpoints.
- Switch (`role="switch"`) **Fail data refresh**, with the description: Shows the non-blocking "last loaded data" banner.
- Button **Refresh data now**.

### Refresh failure banner (non-blocking)
- Sits under the header (phone margin `0 16px 10px`), `role="status"`.
- `--warning-bg`, radius 14, with an outlined "!" circle.
- Text: "Could not refresh — showing last loaded data."
- A **Retry** text button (44px, underlined, `--warning-fg`).
- Never block or clear the existing data.

### Toast
- Absolutely positioned and centred, 96px above the bottom on phone (above the tabs) and 32px on wider screens.
- `--toast-bg` / `--toast-fg`, radius 14, padding `12px 18px`, 14/600, `role="status"`.
- Auto-hides after 2.6s.

---

## Components to build (plain CSS + React)
- `AppShell` / `NavTabs` (bottom, segmented or sidebar variants via CSS)
- `DemoUserChip`
- `BalanceSummary` (total, split cents, `ReservedBar`, legend, explainer)
- `AccountCard`
- `PendingNotice`
- `Field` (label, control, helper/error with `aria-describedby`)
- `Select`
- `AmountInput`
- `SegmentedControl` (radio and tab variants)
- `Button` (primary / secondary / text, with a `loading` state that disables it and swaps the label)
- `StatusBadge`
- `Banner` (tone)
- `Toast`
- `Sheet` (bottom sheet below 700px, centred dialog above; scrim; `role="dialog" aria-modal`; focus trap; Esc closes, except while a request is in flight)
- `ListRow` / `HistoryTable`
- `PaymentRow` (with persistent check result)

### StatusBadge
A pill 24–28px high with padding `0 10px 0 5px`, background in the tone's bg, text in the tone's fg at 13/700. The leading 16px circle is filled with the tone's fg and holds a glyph in the tone's bg:
- Paid ✓ (success)
- Declined ✕ (danger)
- Unconfirmed ? (warning)
- Processing … (info)

**Always show the word as well as the glyph.**

### Buttons
| | height | radius | bg | text | border |
|---|---|---|---|---|---|
| Primary | 54 | 16 | `--accent` | `--on-accent` 16/700 | none |
| Secondary | 44–48 | 12–16 | transparent / `--surface` | `--ink` 14–15/600 | 1.5px `--line-strong` |
| Disabled/loading | — | — | `--disabled-bg` | `--disabled-fg` | — |
| Focus | `outline: 3px solid var(--ring); outline-offset: 2px` | | | | |

## Validation rules (amount)
Apply them in this order (the copy is exact):
1. Empty: "Enter an amount."
2. Doesn't match `^(\d+(\.\d{1,2})?|\.\d{1,2})$` after removing spaces, commas and "$": "Use numbers with up to 2 decimals, like 12.34."
3. ≤ 0: "Enter an amount greater than $0.00."
4. > 100,000,000 cents: "The maximum is $1,000,000.00."

Then:
- Show errors after blur or submit, never on the first keystroke.
- Insufficient funds is **server-authoritative**. Show the server message "The account does not have enough available funds." in the review sheet (Transfer) or above the Pay button (Pay).
- Prevent double submit: disable the button and ignore re-entry while a request is in flight.

## Money formatting
Store amounts in integer cents. Display with `Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})`, prefixed with "$". Negatives use a real minus sign "−$". Deltas are "+$" / "−$", and zero shows as "—". Use `font-variant-numeric: tabular-nums` everywhere.

## State (client)
- `actingUserId`
- `tab`
- `activityTab`
- `historyAccountId`
- transfer form: `{from, toMode, to, amount, touched, phase: form|review|sending|success|error, error, result}`
- pay form: `{from, ref, amount, touched, sending, error, lastPaymentId, dedupedNote}`
- `checkingPaymentId`
- `checkResults: {[paymentId]: {at, text, tone}}`
- `sheet: null|transfer|user|openAccount|dev`
- `refreshFailed`
- `toast`

Refetch accounts, history, transfers and payments after every mutation. If a refetch fails, set `refreshFailed` and keep the last data.

## Accessibility checklist
- Every input has a visible `<label>`.
- Errors are linked with `aria-describedby` and the input gets `aria-invalid`.
- Touch targets are ≥ 44px.
- AA contrast holds for all text pairs in both themes. `--ink-2` on `--bg` is about 6:1; tone fg on tone bg is ≥ 4.5:1.
- Reserved is shown by pattern plus the word. Statuses are shown by glyph plus the word. Deltas carry explicit signs.
- Dialogs trap focus and return it to the trigger. Result and status regions are `aria-live="polite"`.

## Design tokens
See `tokens.css` for the full list: colours for light and dark, the type scale, spacing (4, 8, 12, 16, 20, 24, 32, 40) and radii (8, 12, 14, 16, 20, 24, pill). There is one shadow, `--shadow-card`, and none in dark. Font: **Figtree** 400/500/600/700 from Google Fonts.

## Assets
None. Icons are simple CSS shapes and text glyphs (✓ ✕ ? … ! i ▼ ›). There are no images or illustrations.

## Files
- `CalmWallet.dc.html` + `support.js`: the interactive reference. Open it in a browser. Props such as `theme`, `width` and `preset` are set in the gallery.
- `Calm Wallet Gallery.dc.html`: all states at every size and theme, plus the kit sheet.
- `tokens.css`: tokens to import.
- `CLAUDE_CODE_PROMPT.md`: the prompt to paste into Claude Code.
