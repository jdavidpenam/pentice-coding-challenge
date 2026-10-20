# CLAUDE.md — Transactions App

Assessment project (Pentice "Transactions App"). Source of truth: `/Users/juanpena/Downloads/02 - Challenge Type 1 - Transactions App.pdf`. Plan: `PLAN.md`. Timing: `TIMELOG.md`. Reviews: `REVIEW.md`.

## Commands (planned; update once scaffolded)
- `nvm use` (Node 24 LTS, see `.nvmrc`)
- `npm install`
- `npm run dev` — API on http://127.0.0.1:3000, web on http://localhost:5173
- `npm test` — all tests (API e2e + unit, web unit)
- `npm run typecheck`

## Timing rules
- Start 2026-10-19T19:11:46-05:00 (00:11:46Z). Deadline 2026-10-19T23:11:46-05:00 (04:11:46Z). Never reset.
- Read TIMELOG.md at the start of each prompt/session. Append rows; never rewrite. Use real `date` output only.
- Clock check before and after each phase and before long commands. Report elapsed/remaining.
- 3:00 elapsed → finish/test core, defer optional. 3:30 → no new features. Last 10 min → verify, document, hand off.
- Local milestone commits only; no push without request; never alter Git dates or history.

## Engineering standards
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. No unjustified `any`, unsafe casts, or `!`.
- `unknown` for untrusted input; zod `.strict()` validation on every body/param/query/header used.
- Explicit types at public boundaries; inference inside. Discriminated unions + exhaustive `switch`; `readonly` records.
- Thin controllers and components. Business rules in services; **all balance changes only in `LedgerService`**, synchronous, no `await` between check and write.
- One `PaymentProvider` interface (DI token). No other abstractions without a concrete need.
- Test observable behavior. Never claim a command passed unless it ran.

## Security rules
- Never trust the client: no client-supplied balance, owner, status, or provider result.
- Acting user resolved only in `common/acting-user.ts` (`X-Demo-User-Id`). It is a demo identity, **not authentication** — say so in UI and docs.
- Ownership on every money movement and every read/reconcile; non-owned → 404.
- Amounts: positive safe integers in cents, ≤ 100,000,000. Rejections must not partially mutate state.
- Payment outcomes come only from the provider via the backend. Simulator controls are dev-only.
- Safe error bodies (`{error:{code,message}}`), no stacks. Log IDs/amounts/outcomes, not bodies.
- No funding endpoint; seed only. No real card/bank data. Local only (127.0.0.1, CORS to web origin).

## Review protocol
- Each milestone: stable snapshot (Git commit) → fresh independent reviewer agent given only responsibilities, repo path, doc paths, milestone, commit SHA, deadline, review budget.
- Reviewer does not edit code. Findings are appended to REVIEW.md with real timestamps, then fixed and re-reviewed (focused, bounded).
- No editing reviewed files while a review runs. Unreviewed work at deadline is reported as such.
