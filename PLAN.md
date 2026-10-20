# Transactions App — Plan

> **Baseline status:** initial plan, written by 2026-10-19T19:15:48-05:00 (2026-10-20T00:15:48Z) before any implementation.
> This baseline is preserved. Later changes go in **§12 Amendments** with a timestamp and a reason; requirements are never silently deleted or redefined.

Source of truth: `02 - Challenge Type 1 - Transactions App.pdf` (Pentice, "Code Challenge · Transactions App").

---

## 1. Requirements

Labels: **[PDF]** = explicit in the brief · **[DEC]** = our decision, which the brief allows ("you can define the use case and assumptions yourself, just tell us what you decided") · **[OPT]** = optional extra · **[PROD]** = production concern, documented but out of scope.

### 1.1 Core requirements (from "The problem" and "What we expect")

| ID | Requirement | Source |
|---|---|---|
| R1 | A user can be added (created). | [PDF] "Add a user." |
| R2 | A user can have one or more accounts. | [PDF] |
| R3 | A user can transfer money between their own accounts. | [PDF] |
| R4 | A user can transfer money to other users' accounts. | [PDF] |
| R5 | A transfer moves money correctly: the source is debited and the destination credited by exactly the same amount. | [PDF] "money leaves one account and arrives in another, correctly." |
| R6 | A user can make a payment against a **simulated** payment provider (stub, no real provider is called). | [PDF] |
| R7 | A payment succeeds only when the user has enough balance, and it goes through the simulated provider. | [PDF] |
| R8 | The payment step is behind a provider boundary so a real provider can be dropped in later without rewriting everything. | [PDF] Context paragraph |
| R9 | Every decision is explainable and documented (use case, assumptions, trade-offs). | [PDF] "explain and defend", "tell us what you decided", "understand what you built and why, easily" |
| R10 | Simple UI; money logic matters more than styling. | [PDF] Notes |
| R11 | In-memory state is acceptable (no database required). | [PDF] Notes |
| R12 | Honest time-boxing: at most 4 hours, honestly reported. | [PDF] Notes, Time-box |

### 1.2 Senior bonus (from "Bonus (senior level)") — separate milestone

| ID | Requirement | Source |
|---|---|---|
| B1 | The simulated provider sometimes **times out** or **fails after it has already charged**. | [PDF] |
| B2 | A **retry must not double-charge**. | [PDF] |
| B3 | An **unknown outcome must be resolved correctly** (to the provider's real result). | [PDF] |
| B4 | **Concurrent transfers on the same account must not corrupt the balance.** | [PDF] |

### 1.3 Acceptance criteria

Each criterion is checked by an automated test unless marked *(manual)*.

**Users and accounts**
- AC1 (R1) `POST /users` with a valid name creates a user, returns 201 with `{id, name}` and the user's first account (balance 0). Invalid or unexpected fields → 400 and nothing is created.
- AC2 (R2) The acting user can open more accounts (`POST /accounts`); `GET /accounts` lists only the acting user's accounts with balances.
- AC3 (R2, security) The acting user cannot read another user's account, balance, or history: `GET /accounts/:id` and `GET /accounts/:id/transactions` for a non-owned account → 404 (same response as a non-existent ID).

**Transfers**
- AC4 (R3) Transfer between two of the acting user's accounts: source −X, destination +X, two ledger entries linked to one transfer ID, total money in the system unchanged.
- AC5 (R4) Transfer to another user's account: same as AC4; the sender learns nothing about the recipient's balance.
- AC6 (R5) Rejected transfers leave every balance and ledger unchanged: insufficient funds (422), same source and destination (422), unknown destination (404), source not owned by the acting user (404), malformed amount (400).
- AC7 (security) Amounts that are zero, negative, fractional (not whole minor units), non-numeric, strings, or above the safe/maximum limit → 400.
- AC8 (security) Client-supplied server-controlled fields (`balance`, `userId`/owner, `status`, etc.) in any request body → 400; they never affect state.

**Payments (core)**
- AC9 (R6, R7) A payment with enough balance calls the simulated provider, ends `SUCCEEDED`, and debits the account by exactly the amount.
- AC10 (R7) A payment without enough balance → 422; the provider is **not** called; balance unchanged.
- AC11 (R7) A provider decline ends `FAILED`; the account balance is restored to its pre-payment value.
- AC12 (R8) `PaymentsService` depends only on the `PaymentProvider` interface (DI token). Swapping the simulator for another implementation needs no change to the service, controller, or ledger. Shown by a test that runs the payment flow against a second, test-only provider.
- AC13 (security) The acting user cannot pay from, read, or reconcile another user's account or payment → 404.

**Bonus**
- AC14 (B1) The simulator can be put into these modes: `succeed`, `decline`, `timeout_after_charge`, `error_after_charge`, `timeout_before_charge`. Controls are development-only and inside the simulation.
- AC15 (B2) Repeating `POST /payments` with the same `Idempotency-Key` returns the same payment and never charges again — including after a timeout or error-after-charge. The simulator's charge count for that key stays at 1.
- AC16 (B2) Re-using an `Idempotency-Key` with a different body → 422; no state change.
- AC17 (B3) A timeout or ambiguous error leaves the payment `UNKNOWN` with funds still held. Reconciliation (explicit or triggered by a retry) asks the provider and resolves it: charged → `SUCCEEDED` (hold kept); not charged → `FAILED` (hold released). Never resolved by guessing.
- AC18 (B4) N concurrent transfers/payments from one account, sent through HTTP at the same time, never overdraw it and leave `balance == seed − sum(succeeded)`. Ledger sum always equals the stored balance.

**Frontend** *(manual + small unit tests)*
- AC19 (R10) The UI lets a person: pick a demo user, create a user, open an account, see balances and history, transfer to own or other user's account, make a payment, see payment status, and reconcile an `UNKNOWN` payment.
- AC20 The UI clearly states that the user selector is a demo identity and **not** authentication.

---

## 2. Use case and assumptions [DEC]

The brief lets us define the use case. Decisions:

1. **Use case.** A guest holds a balance in the app ("wallet accounts"). They can move money between their own accounts or to other people (for example splitting a stay). They pay for a room booking from an account; the payment is executed by an external payment provider that settles with the property. Payment money leaves the system.
2. **One currency: USD**, stored as integer **cents**. No FX. Every account is USD.
3. **Funding.** There is **no general "deposit" endpoint**. Demo users are created at startup by a seed with funded accounts (ledger entries of type `SEED`). Users created through the API start with a 0 balance and get money by receiving a transfer. This keeps "money from nowhere" out of the public API.
4. **Demo identity.** The client sends `X-Demo-User-Id`. The backend resolves it in **one** place (`ActingUser` boundary) and rejects unknown IDs (401). **This is not authentication** — anyone can send any ID. Ownership checks show the authorization rules *given* an identity; they do not prove the caller is that person. The resolver is the single seam to replace with verified auth (session/JWT) later.
5. **Creating a user** does not need an acting user (it's a sign-up). It creates the user and one default account.
6. **Recipient lookup.** `GET /directory` returns other users with `{userId, name, accounts: [{accountId, name}]}` — **no balances, no history**. That is the minimal information needed to address a transfer.
7. **Payments** have a payee `reference` (e.g. booking reference, `^[A-Za-z0-9 _#-]{1,64}$`) and an amount. No card data, no bank details.
8. **Limits.** Max single operation: 1,000,000.00 USD (100,000,000 cents). Balances stay far below `Number.MAX_SAFE_INTEGER`.
9. **Not-found vs forbidden.** Resources the acting user may not see return **404**, same as non-existent IDs, to avoid confirming that they exist.
10. **Local only.** The API binds to `127.0.0.1`; CORS allows only the configured frontend origin.

---

## 3. Stack and versions

Checked on 2026-10-19 against the npm registry (`npm view … version / dist-tags / engines / peerDependencies`) and nodejs.org/dist/index.json. Only `latest`-tagged stable releases; no prereleases.

| Tool | Version | Why this one |
|---|---|---|
| Node.js | **24.x LTS "Krypton"** (24.22.0, active LTS) | Supported LTS. The machine default is 23.8.0 (odd-numbered, not LTS), so we pin with `.nvmrc` and `engines`. |
| npm | bundled with Node 24 | Workspaces + lockfile. |
| TypeScript | **6.0.3** | `latest` is 7.0.2 (native compiler), but `@nestjs/cli@12` ships `typescript ~6.0.2` and Nest needs `experimentalDecorators` + `emitDecoratorMetadata`. Using 6.0.3 avoids an unverified decorator-metadata path in TS 7. |
| NestJS (`core`, `common`, `platform-express`, `testing`) | **12.1.3** | Latest is 12.2.0 published *today*; 12.1.3 is the newest patch with a week of use. ESM packages, Node ≥ 20. |
| `@nestjs/cli` | 12.0.9 | Build/dev runner. |
| `reflect-metadata` / `rxjs` | 0.2.2 / 7.8.2 | Nest peers. |
| zod | **4.6.7** | Runtime validation at HTTP boundaries with `.strict()` objects (rejects unknown fields). Chosen over class-validator: one schema gives both the runtime check and the static type. |
| React / React DOM | 19.3.1 | Current stable. |
| Vite / `@vitejs/plugin-react` | 8.3.4 / 6.1.2 | Plugin peers `vite ^8`. |
| Vitest | 5.0.5 | Peers `vite ^6–8`; Node `^22.12 ‖ ^24`. Used for API and web tests. |
| `unplugin-swc` + `@swc/core` | 2.0.0 / 1.16.18 | Vitest's default transform (esbuild/oxc) doesn't emit decorator metadata, which Nest DI needs; SWC does. |
| supertest | 7.3.1 | HTTP-level tests against the Nest app. |

Exact resolved versions are fixed by `package-lock.json` (committed).

---

## 4. Architecture

A small npm workspace with two apps. One Nest process, one Vite dev server. No database, no microservices, no CQRS/event sourcing, no generic repository framework.

```
.
├── package.json            # workspaces: apps/api, apps/web; root scripts
├── .nvmrc                  # 24
├── apps/
│   ├── api/                # NestJS
│   │   ├── src/
│   │   │   ├── main.ts                 # bootstrap: 127.0.0.1, CORS origin, body limit, filters
│   │   │   ├── app.module.ts
│   │   │   ├── common/
│   │   │   │   ├── money.ts            # Money rules: amount schema, limits
│   │   │   │   ├── errors.ts           # DomainError union (code → HTTP status)
│   │   │   │   ├── error.filter.ts     # safe error bodies, no stacks
│   │   │   │   ├── zod.pipe.ts         # validate body/params/query with zod
│   │   │   │   └── acting-user.ts      # THE identity boundary (X-Demo-User-Id → User)
│   │   │   ├── ledger/
│   │   │   │   ├── store.ts            # in-memory maps: users, accounts, entries, transfers, payments
│   │   │   │   └── ledger.service.ts   # the ONLY code that changes balances
│   │   │   ├── users/                  # create user, directory
│   │   │   ├── accounts/               # open, list, get, history
│   │   │   ├── transfers/              # transfer use case
│   │   │   ├── payments/
│   │   │   │   ├── payment-provider.ts       # interface + DI token
│   │   │   │   ├── simulated-provider.ts     # stub with failure modes
│   │   │   │   ├── payments.service.ts       # hold → charge → settle / release / unknown
│   │   │   │   ├── payments.controller.ts
│   │   │   │   └── dev-provider.controller.ts# dev-only: set simulator mode
│   │   │   └── seed.ts
│   │   └── test/                       # supertest e2e + unit tests
│   └── web/                # React + Vite
│       └── src/
│           ├── api.ts            # typed fetch client, sends X-Demo-User-Id
│           ├── money.ts          # "12.34" ⇄ 1234 without floats
│           ├── App.tsx
│           └── components/       # UserPicker, Accounts, TransferForm, PaymentForm, History, Payments
```

### 4.1 Layers
- **Controllers** are thin: validate input (zod pipe), resolve the acting user, call one service method, map the result.
- **Services** hold the use-case rules (ownership, sufficient funds, payment state machine).
- **`LedgerService`** is the single place that mutates balances. Each mutation (`transfer`, `hold`, `release`) is one **synchronous** function: check → write all entries → update balances. Nothing is written if a check fails.
- **Store** is plain `Map`s. Records are `readonly`; updates replace records.

### 4.2 Ledger model
- `Account { id, userId, name, currency: 'USD', balanceMinor }`
- `LedgerEntry { id, accountId, amountMinor (signed), kind: 'SEED' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'PAYMENT_HOLD' | 'PAYMENT_RELEASE', referenceId, createdAt }`
- Invariant (tested): for every account, `balanceMinor == Σ entries.amountMinor` and `balanceMinor ≥ 0`.
- A transfer writes `TRANSFER_OUT −X` and `TRANSFER_IN +X` with the same `transferId`.
- The stored balance is kept alongside the entries (instead of summing every read) because that's what a DB-backed version would do with a conditional update.

### 4.3 Error model
`DomainError` is a discriminated union on `code` (`VALIDATION`, `NOT_FOUND`, `INSUFFICIENT_FUNDS`, `SAME_ACCOUNT`, `IDEMPOTENCY_CONFLICT`, `UNKNOWN_USER`, …), mapped to HTTP with an exhaustive `switch`. Response body: `{ "error": { "code", "message", "details"? } }`. Unknown errors → 500 `{ code: "INTERNAL" }`; stack traces are logged server-side only.

### 4.4 HTTP API (draft)

| Method & path | Acting user | Purpose |
|---|---|---|
| `POST /users` | no | Create user `{name}` + default account |
| `GET /users` | no | Demo user list for the selector (`id`, `name` only) |
| `GET /directory` | yes | Recipients: users → account IDs + names, no balances |
| `GET /accounts` | yes | My accounts with balances |
| `POST /accounts` | yes | Open account `{name}` |
| `GET /accounts/:id` | yes (owner) | Account detail |
| `GET /accounts/:id/transactions` | yes (owner) | Ledger entries |
| `POST /transfers` | yes (owner of source) | `{fromAccountId, toAccountId, amountMinor}` |
| `POST /payments` | yes (owner of source) | `{accountId, amountMinor, reference}` + `Idempotency-Key` header |
| `GET /payments` · `GET /payments/:id` | yes (owner) | Payment status |
| `POST /payments/:id/reconcile` | yes (owner) | Resolve `UNKNOWN` |
| `POST /dev/provider/mode` | dev only | Set simulator mode (not registered when `NODE_ENV=production` or `DEV_TOOLS` off) |

---

## 5. Money representation and validation

- **Integer minor units (cents)** in a JS `number`, always checked with `Number.isSafeInteger`. No floats in money math. Max per operation 100,000,000 cents. (`bigint` was considered: safer at extreme values but awkward in JSON; the operation cap keeps all balances far below 2^53.)
- **API takes `amountMinor` as a JSON integer.** zod schema: `z.number().int().positive().max(MAX)` plus a `Number.isSafeInteger` refine. Strings, decimals, `0`, negatives, `NaN`, `Infinity` (not representable in JSON anyway) → 400.
- **The frontend parses** the user's text `"12.34"` with a regex (`^\d{1,7}(\.\d{1,2})?$`) into cents by string handling, never `parseFloat(x) * 100`. More than 2 decimals is rejected. Unit tested.
- **Display** formats cents with `Intl.NumberFormat('en-US', {style:'currency', currency:'USD'})` from `cents / 100` — display only.

---

## 6. Payment design and provider contract

### 6.1 Provider interface (R8)
```ts
export interface PaymentProvider {
  /** Charge once per idempotencyKey. Resolves with a definitive result; throws (or never settles) when the outcome is unknown. */
  charge(req: ChargeRequest): Promise<ChargeResult>;
  /** Look up the outcome of a previous charge by the same key. */
  lookup(idempotencyKey: string): Promise<ChargeLookup>;
}
type ChargeRequest = { readonly idempotencyKey: string; readonly amountMinor: number; readonly currency: 'USD'; readonly reference: string };
type ChargeResult  = { readonly status: 'succeeded'; readonly providerChargeId: string }
                   | { readonly status: 'declined'; readonly reason: string };
type ChargeLookup  = ChargeResult | { readonly status: 'not_found' };
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
```
- Bound in `PaymentsModule` with `{ provide: PAYMENT_PROVIDER, useClass: SimulatedPaymentProvider }`. A real provider = one new adapter class mapping its SDK to these three result shapes + changing this binding.
- This mirrors real providers (Stripe-style idempotency keys + retrieve-by-ID). The provider key is our server-generated `paymentId`, never a client value.

### 6.2 Payment flow (core)
1. Validate body; resolve acting user; check the source account belongs to them (else 404).
2. **Hold:** `LedgerService.hold()` — synchronous check-and-debit (`PAYMENT_HOLD −X`). Insufficient funds → 422, nothing written, provider not called.
3. Create `Payment { id, userId, accountId, amountMinor, reference, status: 'PENDING', idempotencyKey, attempts: 0 }`.
4. Call `provider.charge` with a timeout (`PROVIDER_TIMEOUT_MS`, default 2000 ms).
   - `succeeded` → `SUCCEEDED` (hold becomes final, stores `providerChargeId`).
   - `declined` → `FAILED`, `LedgerService.release()` (`PAYMENT_RELEASE +X`).
   - throw / timeout → `UNKNOWN` (bonus milestone; in core it's still handled safely: funds stay held).

Status set: `PENDING → SUCCEEDED | FAILED | UNKNOWN`, `UNKNOWN → SUCCEEDED | FAILED`. Transitions are checked by one function with an exhaustive switch; terminal states never change.

**Why hold before charging:** the provider call is async. Checking the balance, awaiting the provider, then debiting would let two concurrent payments both pass the check. Taking the money first in one synchronous step closes that gap.

### 6.3 Bonus: failure safety (B1–B3)
- **Simulator** keeps its own `Map<idempotencyKey, Charge>`. Modes: `succeed`, `decline`, `timeout_after_charge` (records the charge, then never answers in time), `error_after_charge` (records the charge, then throws), `timeout_before_charge`. Mode is set by a dev-only endpoint or directly in tests; optional `PROVIDER_FAILURE_RATE` for random failures in dev. A repeated `charge` with a known key returns the stored result and **does not charge again** — like real providers.
- **Client idempotency:** `POST /payments` requires an `Idempotency-Key` header (UUID; the web app makes one per payment form submission and reuses it on retry). Stored per `(userId, key)` with a fingerprint of the body.
  - Same key + same body → return the existing payment; if it is `UNKNOWN`, reconcile first. Never a second hold or a second charge.
  - Same key + different body → 422 `IDEMPOTENCY_CONFLICT`.
  - Concurrent duplicates: the key is reserved synchronously before the first `await`, so a second identical request sees the existing payment.
- **Reconciliation** (`POST /payments/:id/reconcile`, and automatically on retry): `provider.lookup(paymentId)`
  - `succeeded` → `SUCCEEDED`; `declined` → `FAILED` + release.
  - `not_found` → the charge never happened: re-send `charge` with the **same** provider key (safe, provider dedupes), then apply the result. *(Alternative considered: mark FAILED on `not_found`. Rejected for a real provider because a slow in-flight charge could still land; re-sending with the same key is safe either way.)*
  - lookup throws → stays `UNKNOWN`, funds stay held, caller sees `UNKNOWN`.
- Background reconciliation sweeper: **[OPT]**, only if time allows.

### 6.4 Bonus: concurrency (B4)
- Node runs JavaScript on one thread. Each `LedgerService` mutation is synchronous, with **no `await` between reading a balance and writing it**, so two requests cannot interleave inside it. That is the actual guarantee, and the code is structured to keep it (the payment hold is taken before the provider `await`).
- Proven by tests that fire many concurrent HTTP transfers/payments at one account and then check no overdraft and the ledger invariant.
- If storage becomes async (a real DB), this guarantee **does not carry over**: it would need a DB transaction with a conditional update (`UPDATE … SET balance = balance − X WHERE id = ? AND balance ≥ X`) or row locks with a consistent lock order. Documented as a deferred production concern. A keyed async mutex is **not** added now because nothing in the current code awaits inside a critical section; adding it would be untested ceremony.

---

## 7. Security considerations

Implemented inside validation, services, the provider boundary, and tests — no extra layers.

| # | Protection | Where |
|---|---|---|
| S1 | zod `.strict()` schemas on every body, param, query, and on the `Idempotency-Key` header; unknown fields rejected | `zod.pipe.ts`, per-controller schemas |
| S2 | Server-controlled fields (balance, owner, status, provider result, hold amounts) are never read from requests | schemas only allow writable fields |
| S3 | One acting-user boundary; unknown ID → 401 | `acting-user.ts` |
| S4 | Ownership required for transfer source, payment source, every account/payment read, and reconcile; non-owned = 404 | services |
| S5 | Recipients exposed only as IDs + names | `GET /directory` |
| S6 | Amount rules and all balance changes centralized; no partial writes on rejection | `money.ts`, `LedgerService` |
| S7 | Payment outcomes decided only by the backend via the provider; no client-set status | `PaymentsService` |
| S8 | No funding endpoint; seed only | `seed.ts` |
| S9 | Simulator controls dev-only, confined to the simulator | `dev-provider.controller.ts` registered conditionally |
| S10 | Safe errors: code + message, no stacks/internals | `error.filter.ts` |
| S11 | Body size limit (16 kb JSON), `x-powered-by` off, CORS = configured origin, bind 127.0.0.1 | `main.ts` |
| S12 | Structured logs of operation ID, account IDs, amount, outcome, time; never full bodies or names | services |
| S13 | No secrets in repo; config from env with safe defaults; `.env` git-ignored | `.gitignore` |

**Demo limitations (stated, not fixed):** the `X-Demo-User-Id` header can be forged; in-memory data is lost on restart and the ledger is mutable, so it is not a tamper-proof audit trail; no rate limiting; no TLS; not for real funds or public deployment.

**Security tests (planned):** unauthorized debit via transfer and payment; unauthorized read of account/history/payment; unauthorized reconcile; server-controlled fields in bodies; malformed amounts; state unchanged after each rejection; error bodies contain no stack or internal fields; (bonus) duplicate payments and concurrent spending.

---

## 8. Roadmap and milestones

Times are targets inside the single 4-hour window (start 19:11:46 Bogotá, deadline 23:11:46 Bogotá). Each milestone ends with tests run, a local Git commit, and an independent review.

| M | Milestone | Target end (elapsed) | Scope |
|---|---|---|---|
| M0 | Plan | 0:30 | PLAN.md, CLAUDE.md, TIMELOG.md, REVIEW.md; plan review |
| M1 | Scaffolding | 0:50 | Workspace, strict TS configs, Nest + Vite boot, Vitest + SWC, error filter, zod pipe, acting user |
| M2 | Users & accounts | 1:15 | R1, R2, AC1–AC3, AC7–AC8 basics, seed, directory |
| M3 | Transfers | 1:40 | R3–R5, AC4–AC8, ledger invariant tests |
| M4 | Provider + payments (core) | 2:10 | R6–R8, AC9–AC13 |
| M5 | Frontend | 2:45 | AC19–AC20 |
| — | **3:00 cutoff** | 3:00 | Core must be complete and tested. Bonus only if it fits. |
| M6 | Senior bonus | 3:25 | B1–B4, AC14–AC18 |
| — | **3:30 cutoff** | 3:30 | No new features. |
| M7 | Final verification & handoff | 3:50 | Full test run, README (how to run, decisions, limitations), final review, TIMELOG close |

**Core vs optional.**
- Core = M1–M5 (R1–R12, AC1–AC13, AC19–AC20).
- Bonus = M6. Note: the core payment flow already holds before charging and treats timeouts as "funds stay held", so the bonus adds idempotency keys, the `UNKNOWN` state, reconciliation, simulator failure modes, and concurrency tests on top — not a rewrite.
- Optional extras if time remains (in order): background reconciliation sweeper; `GET /payments` filtering; OpenAPI notes in README. Each is cut first at the 3:00 mark.

---

## 9. Verification strategy

- **API e2e (Vitest + supertest)** on a real Nest app instance with a fresh in-memory store per test file. Cover every AC1–AC18 and every security test in §7.
- **Unit tests:** money parsing (web), payment status transitions, simulator modes, ledger invariant helper.
- **Typecheck** `tsc --noEmit` for both apps in CI script; `npm test` runs both apps.
- **Manual smoke:** run both apps, walk AC19–AC20 in a browser.
- Commands and results recorded in TIMELOG/README. Nothing is reported as passing unless it was actually run.

---

## 10. Trade-offs

| Decision | Alternative | Why |
|---|---|---|
| Integer cents in `number` + cap | `bigint`, decimal library | Exact, JSON-friendly, simple; cap keeps it safe. |
| Stored balance + ledger entries | Balance derived by summing | Matches how a DB version works; invariant test keeps them consistent. |
| Hold funds before provider call | Check, call, then debit | Prevents double spend across the `await`; failures release. |
| zod at boundaries | class-validator DTOs | One schema = runtime check + type; easy `.strict()`. |
| Header-based demo identity | Real auth | Out of scope; one replaceable seam. |
| 404 for non-owned resources | 403 | Doesn't reveal that an ID exists. |
| No async mutex | Keyed mutex | No await inside critical sections today; DB version needs DB-level guarantees anyway. |
| TS 6.0.3, Nest 12.1.3 | TS 7.0.2, Nest 12.2.0 | Compatibility with Nest decorators/CLI; avoid a same-day release. |
| No shared types package | `packages/contracts` | Small API; duplicating a few types in the web client is cheaper than workspace build wiring. |

## 11. Deferred production requirements [PROD]

Real authentication and session management; persistent DB with transactions/conditional updates; durable outbox + background reconciliation worker; provider webhooks and signature verification; append-only/immutable audit log; rate limiting and abuse controls; multi-currency and FX; KYC/AML, limits, fraud checks; PCI scope if cards are ever touched; TLS, secrets management, observability (metrics, tracing, alerts); data retention/privacy policy; refunds/chargebacks; deployment hardening.

---

## 12. Amendments

_Append-only. Format: timestamp (Bogotá & UTC) · change · reason._

### A1 — written by 2026-10-19T19:18:11-05:00 (2026-10-20T00:18:11Z) · Resolve plan review M0 (REVIEW.md, review R-M0)
Requirements are unchanged; these amendments tighten the design and add acceptance criteria. Baseline text above is kept for traceability; where it conflicts, **this amendment wins**.

- **A1.1 (H1) Single-winner settlement.** Every payment state change after a provider `await` is applied by one synchronous `settle(paymentId, from: 'PENDING'|'UNKNOWN', outcome)` step. It re-reads the payment and applies the transition **and** any `release()` together, and only if the payment is still in an expected non-terminal state. Losers of the race are no-ops that return the current payment. A late result from the original `charge` call (after the timeout fired) goes through the same `settle()` and is dropped if the payment has already moved on.
  - **New AC21:** concurrent reconciles, and reconcile + same-key retry, on one `UNKNOWN` payment produce at most one `PAYMENT_RELEASE` (or none, when charged) and keep the ledger invariant. The provider charge count stays ≤ 1.
- **A1.2 (M1) AC17 corrected wording.** Baseline AC17's "not charged → FAILED" contradicted §6.3. Corrected AC17: reconciliation calls `provider.lookup(paymentId)`. `succeeded` → `SUCCEEDED`. `declined` → `FAILED` + release. `not_found` → re-send `charge` with the same provider key and apply the definitive result. A thrown error or timeout → stays `UNKNOWN`. Never decided by guessing. *Reason: internal inconsistency; the design in §6.3 is the intended behavior, and B3 ("resolved correctly") is unchanged.*
- **A1.3 (M2) Indefinite UNKNOWN is intentional.** While the provider can't give a definitive answer, the payment stays `UNKNOWN`, the funds stay held, and the UI shows `UNKNOWN` with a Reconcile action. **New AC22:** when lookup keeps failing, the payment stays `UNKNOWN` and the balance stays reduced by the hold — no release, no second charge. Manual operator resolution and alerting are added to §11.
- **A1.4 (M3) Atomic reservation.** `POST /payments` generates `paymentId`. In one synchronous step it checks idempotency, checks ownership, places the hold (`referenceId = paymentId`), creates the `Payment`, and records `(userId, key) → paymentId`. A rejected request (422/404/400) reserves no key. **New AC23:** a missing or malformed `Idempotency-Key` (must be a UUID) → 400. After a 422 insufficient-funds rejection, the same key can be used again once funds exist, and it creates exactly one payment.
- **A1.5 (L1)** A provider timeout uses `Promise.race`. The original promise keeps running; its result is routed through `settle()` (A1.1) and ignored if the payment is no longer `PENDING`.
- **A1.6 (L2)** Dev tools are **off by default**. `DEV_TOOLS=true` is set only by the `dev` script and tests, and they're never registered when `NODE_ENV=production`. The dev endpoint changes only the simulator's mode, never payments or ledger records.
- **A1.7 (L3)** `X-Demo-User-Id` is validated with zod (UUID) in `acting-user.ts` before lookup. Missing or malformed → 401 `UNKNOWN_USER`, same as an unknown ID.
- **A1.8 (L4)** Transfers have no idempotency key: a client retry after a network error could transfer twice. The brief doesn't require it. Added as **[OPT] extra #1** (same `Idempotency-Key` mechanism) if time allows, and under §11 otherwise.
- **A1.9 (L5) M1 fallback.** If Vitest + `unplugin-swc` decorator metadata isn't working by 0:45 elapsed, run API e2e tests against `tsc`-compiled output (or use explicit `@Inject()` tokens so DI doesn't depend on emitted metadata).
- **§11 additions:** operator tooling for stuck `UNKNOWN` payments with alerting; idempotency keys on transfers.

### A2 — written by 2026-10-19T19:31-05:00 (00:31Z) · Resolve milestone A review (REVIEW.md R-A)
- **A2.1 (F1)** The 401 error code for a missing, malformed, or unknown demo-user header is `DEMO_USER_REQUIRED` (A1.7 said `UNKNOWN_USER`). Behavior is unchanged; only the name.
- **A2.2 (F3)** Global cap of 1,000 users (`USER_LIMIT_REACHED`, 422) to bound in-memory growth from the unauthenticated `POST /users`.
- **A2.3 (F2)** Credits from transfers are capped at `MAX_BALANCE_MINOR`; releases of held payment funds are deliberately exempt (returning money must not fail). Documented in the README.

### A3 — written by 2026-10-19T19:46:25-05:00 · Senior bonus design (B1–B4)
Baseline §6.3–6.4 and A1 still apply. This amendment makes them concrete and changes four things, each with its reason: (a) reserved funds are now a separate bucket, not a debit, because the bonus prompt requires available and reserved funds to be clearly distinguished; (b) statuses are renamed and `UNKNOWN` is added; (c) a key reused with a different payload returns 409, not the baseline's 422, because it is a conflict with an existing resource, not a validation error; (d) the Idempotency-Key format is `[A-Za-z0-9_-]{8,100}`, not only UUID, to fit other client key generators. The web app sends a UUID.

**A3.1 Failure scenarios to defend against**
1. *Charge then lost response.* The provider charged, but its answer times out or errors. If we treated that as failure and released the funds, the user keeps the money *and* the merchant is paid, which creates money. → Must stay reserved as `UNKNOWN`.
2. *Timeout before charge.* The provider never charged. If we kept it `UNKNOWN` forever, the funds would be stuck. → Reconcile: lookup says `not_found` → re-send the charge with the **same** provider key → definitive result.
3. *Client retry after a network error.* The user clicks Pay again. Without idempotency we'd get a second reservation and a second charge. → `Idempotency-Key` per user + operation, bound to the payload.
4. *Two identical requests at the same time* (double click, proxy retry). → Key lookup, reservation, and payment creation happen in one synchronous step before any `await`; the second request finds the first.
5. *Two reconciles at once, or a reconcile during the original call.* → They could double capture or double release. Single-flight: only a `UNKNOWN → PROCESSING` compare-and-set may start provider work; everyone else gets the current state.
6. *A transfer during an in-flight payment.* → Reserved funds are not available; the transfer sees only `availableMinor`.
7. *Concurrent transfers on one account.* → Each transfer is one synchronous check-and-write (no `await`), so they serialize.
8. *Not-found treated as never-charged.* A slow in-flight charge could still land. → `not_found` never marks a payment FAILED; we re-charge with the same key, so the provider dedupes.

**A3.2 Account buckets**
`availableMinor` (spendable) and `reservedMinor` (held for unresolved payments). Ledger entries carry both deltas:

| Entry | available | reserved |
|---|---|---|
| SEED, TRANSFER_IN | +X | |
| TRANSFER_OUT | −X | |
| PAYMENT_RESERVE | −X | +X |
| PAYMENT_RELEASE (definitive failure) | +X | −X |
| PAYMENT_CAPTURE (confirmed success; money leaves) | | −X |

Invariants (tested): each bucket = Σ of its deltas, both ≥ 0, and `reservedMinor` = Σ amounts of that account's payments in `PROCESSING`/`UNKNOWN`.

**A3.3 Payment states and legal transitions**
- `PROCESSING`: funds reserved; exactly one provider call (charge or lookup) is in flight for it.
- `UNKNOWN`: funds reserved; the last provider call ended without a definitive answer (timeout, error, lookup `pending`/error).
- `SUCCEEDED` (terminal): provider confirmed; reservation captured once.
- `FAILED` (terminal): provider definitively declined; reservation released once.

```
create ─(reserve)→ PROCESSING ─succeeded→ SUCCEEDED   (capture)
                         │      ─declined→ FAILED      (release)
                         └─timeout/error/pending→ UNKNOWN
UNKNOWN ─reconcile or same-key retry (CAS)→ PROCESSING ─(lookup; if not_found → charge same key)→ …as above
```
Terminal states never change. Every transition is one synchronous compare-and-set inside `PaymentsService`, together with its ledger entry.

**A3.4 Provider contract (expected of a real provider, not assumed)**
`charge({idempotencyKey,…})` → `succeeded | declined`, throws when the outcome is unknown. `lookup(idempotencyKey)` → `succeeded | declined | pending | not_found`. `not_found` means "no record yet", **not** "will never be charged". We need the real provider to: honour idempotency keys on charge for at least our retry window, offer lookup by our key (or store their ID from a response we never received — impossible, so key-lookup is required), and make declines definitive. If a candidate provider lacks key lookup, we'd need webhooks or a different design. Service-level timeout: `PROVIDER_TIMEOUT_MS` (default 3000).

**A3.5 Simulator scenarios (deterministic, dev-only control)**
`approve`, `decline`, `timeout_before_charge` (no record, response "times out"), `charge_then_timeout` (records the success, then the response is lost). The selected mode applies to new charge keys; a repeated key returns its stored outcome. Lookup returns the stored record or `not_found`. Tests may also inject a controllable provider (deferred promises) to force interleavings.

**A3.6 Idempotency**
The `Idempotency-Key` header is required on `POST /payments`. It's stored under `(actingUserId, 'payment', key)` with a fingerprint of the normalized `{accountId, amountMinor, reference}`. Same key + same payload → the existing payment, with no new reserve or charge; if it's `UNKNOWN`, it's reconciled first. Same key + different payload → **409** `IDEMPOTENCY_KEY_REUSED`. Another user's identical key is a different scope, so nothing about the first user's payment is visible. A rejected request (validation, 404, insufficient funds) records no key. The store is in memory: no durability across restarts.

**A3.7 Synchronization strategy (single process)**
One rule everywhere: **every check-and-mutate of money or payment state is a single synchronous function with no `await`** (ledger methods, payment CAS transitions). Provider waits happen only outside them. Node runs one JavaScript task at a time, so these critical sections are atomic relative to every other request in this process. No locks are needed or held across network waits. **Scope:** one Node process with in-memory state. No crash recovery, no durable idempotency, no multi-instance safety. A DB version would need transactions/conditional updates and a durable idempotency table.

**A3.8 New endpoints / UI**
`POST /payments/:id/reconcile` (owner only). The UI shows Available/Reserved, labels `PROCESSING`/`UNKNOWN` as unresolved, offers "Check status" on unresolved payments, and keeps the same Idempotency-Key when retrying a payment whose response was lost.
