# Transactions App

A small app that moves money between people and pays for a room through a **simulated** payment provider. It's built for the Pentice "Transactions App" code challenge.

- Requirements, decisions, and amendments: [`PLAN.md`](PLAN.md)
- Time log: [`TIMELOG.md`](TIMELOG.md)
- Independent reviews: [`REVIEW.md`](REVIEW.md)
- Standards: [`CLAUDE.md`](CLAUDE.md)

> **Demo only.** Picking a user in the UI is **not** authentication: anyone can act as anyone. State is in memory and is lost on restart. Do not use this for real funds or deploy it publicly.

## Run it

Requires Node 24 LTS (`.nvmrc`).

```bash
nvm use            # Node 24
npm install
npm run dev        # API http://127.0.0.1:3000/api (dev tools on) + web http://localhost:5173
```

Open http://localhost:5173 and pick **Alice** (funded), **Bob** (funded), or **Carol** (empty).

| Command | What it does |
|---|---|
| `npm test` | API end-to-end and unit tests (Vitest + supertest), then web tests (Vitest + Testing Library) |
| `npm run typecheck` | `tsc --noEmit` for both apps |
| `npm run lint` | ESLint (`typescript-eslint` strict type-checked + react-hooks) |
| `npm run build` | `nest build` + `vite build` |
| `npm run check` | All four, in order |

API environment variables:

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `3000` | API port |
| `DEV_TOOLS` | off (the `dev` script sets `true`) | Exposes `/api/dev/provider` simulator controls. Never on when `NODE_ENV=production`. |
| `SEED_DEMO_DATA` | on | Set to `false` to start with no users |

## What it does

| Feature | API | UI |
|---|---|---|
| Add a user. It starts with one empty "Main" account. | `POST /api/users` | "Add user" |
| Demo user list | `GET /api/users` | "Acting as" selector |
| Open more accounts; list your own with balances | `POST/GET /api/accounts` | "My accounts" |
| Account detail and history (owner only) | `GET /api/accounts/:id`, `/:id/transactions` | "Activity → Account history" |
| Who you can send to (names + account IDs only) | `GET /api/directory` | "Transfer → To" |
| Transfer to your own account or another user's | `POST /api/transfers` | "Transfer" |
| Transfers you sent or received | `GET /api/transfers` | "Activity → Transfers" |
| Pay for a room through the simulated provider | `POST /api/payments` | "Pay for a room" |
| Your payments and their status | `GET /api/payments`, `/:id` | "Activity → Payments" |
| Simulator: approve or decline next payments (dev only) | `GET /api/dev/provider`, `POST /api/dev/provider/mode` | "Simulated provider (dev only)" |

Every endpoint except `/users` and `/dev/*` needs the `X-Demo-User-Id` header.

## Money rules

- **One currency, USD. All amounts are integer cents** (`balanceMinor`, `amountMinor`). There's no floating-point money maths anywhere.
- **The API accepts only JSON integers**, from 1 to 100,000,000 cents ($1,000,000.00). Strings, decimals, zero, negatives, unsafe integers, and amounts above the cap get 400. Nothing is coerced or rounded.
- **The UI parses typed text using string operations.** `"12.34"` becomes `1234`. `"1.234"`, `"1e3"`, and `"1,000"` are rejected, not repaired (`apps/web/src/money.ts`).
- **Balance cap.** A transfer may not push an account above $10,000,000,000.00 (422 `BALANCE_LIMIT_EXCEEDED`). Returning held payment funds after a decline is deliberately exempt, because returning money must never fail. It can't overflow, since amounts are capped.
- **Funding.** There's no deposit endpoint. Money enters only through the startup seed (`apps/api/src/seed.ts`), recorded as `SEED` ledger entries. New users get money by receiving a transfer.

### Where the money flow lives

| File | Role |
|---|---|
| `apps/api/src/ledger/ledger.service.ts` | **The only code that changes balances.** `transfer`, `holdForPayment`, `releasePaymentHold`, `seed`. Each one is synchronous and all-or-nothing: all checks first, then all writes. |
| `apps/api/src/transfers/transfers.service.ts` | Source-ownership check, then a ledger transfer, then the transfer record |
| `apps/api/src/payments/payments.service.ts` | Payment flow and state machine (below) |
| `apps/api/src/payments/payment-provider.ts` | The provider interface: the seam for a real provider |
| `apps/api/src/payments/simulated-payment-provider.ts` | The stub provider, with its own books, separate from our ledger |
| `apps/api/src/common/money.ts` | Currency, limits, amount schema |
| `apps/api/src/common/acting-user.ts` | The single demo-identity boundary |

**Invariant (asserted after every test in the transfer and payment suites):** every account's `balanceMinor` equals the sum of its ledger entries and is never negative. A transfer writes `TRANSFER_OUT −X` and `TRANSFER_IN +X` under one transfer ID, so the total of internal funds is unchanged.

### Payment semantics

1. Check that the acting user owns the account (otherwise 404).
2. **Hold:** in one synchronous step, check funds and write `PAYMENT_HOLD −X`. If funds are insufficient, it's a 422, nothing is written, and the provider is not called.
3. Call `provider.charge({ idempotencyKey: paymentId, … })`.
4. The outcome is applied by a synchronous compare-and-set that only moves a `PENDING` payment:
   - **Confirmed success** → `SUCCEEDED`. The hold becomes the final debit.
   - **Definitive decline** → `FAILED`. `PAYMENT_RELEASE +X` returns the funds.
   - **The provider throws** (the outcome is unknown) → stays `PENDING`, funds stay held. The response is still `201`, with `status: "PENDING"`. The UI says "The provider did not confirm the payment. Your funds are held until it is resolved." Releasing here could hand back money the provider already took.

**Why hold before charging?** The provider call is `await`ed. If we checked the balance, awaited, and then debited, two concurrent payments could both pass the check. Taking the funds first, before any `await`, closes that gap.

**Not handled in this milestone (it's the senior-bonus milestone, not done yet):** resolving `PENDING`/unknown outcomes (reconciliation), client idempotency keys and safe retries, timeout and "failed after charging" simulation, and concurrency tests. Nothing here claims those guarantees. The provider already receives the server-generated payment ID as its idempotency key, and the simulator de-duplicates by it, so that milestone can build on this design.

### Replacing the provider

Write a class that implements `PaymentProvider.charge()`:
- resolve `succeeded` only when the provider confirmed the charge;
- resolve `declined` only when it definitively refused;
- **throw for anything ambiguous** (timeouts, 5xx, network).

Then change one binding in `apps/api/src/app.module.ts`:

```ts
{ provide: PAYMENT_PROVIDER, useClass: RealProviderAdapter }
```

The service, controller, and ledger don't change. A test (AC12) runs the payment flow against a different provider implementation to show this. A real adapter should also validate the provider's response shape (an unexpected shape currently ends in a 500 with the payment left `PENDING` and funds held, which is safe but unhelpful).

## Security: implemented protections

- **Input validation:** zod `strictObject` on every body (unknown fields → 400), UUID checks on route IDs and on the demo header, a 16 kb JSON body limit, and safe 400s for malformed JSON.
- **Server-controlled state is never writable:** balance, owner, status, provider result, and IDs. Tests try to inject each one.
- **One acting-user boundary** (`ActingUserResolver`). A missing, malformed, or unknown ID → 401 `DEMO_USER_REQUIRED`. Body validation runs before identity resolution. Both reject without changing state.
- **Ownership** is checked on transfer source, payment source, account detail and history, and payment reads. A resource you don't own gives the **same 404 as one that doesn't exist**. Transfers are listed only to their sender and recipient.
- **Minimal recipient info:** the directory returns names and account IDs, never balances or history.
- **No partial mutations:** ledger methods validate everything before writing. Tests compare a deep snapshot of all financial state before and after each rejected request.
- **Payment outcomes come only from the provider via the backend.**
- **Safe errors:** `{ "error": { "code", "message", "details"? } }`. No stack traces or internals; unexpected errors become a generic 500 and are logged server-side.
- **Dev tools are off by default**, never on in production, and only change the simulator.
- **Limits:** 10 accounts per user, 1,000 users in total (memory bound).
- **Local only:** the API binds to `127.0.0.1`; the web app reaches it through the Vite proxy (same origin, so CORS isn't enabled). The API also sends `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`, and hides `X-Powered-By`.
- **Logs** record event, IDs, amount, and status as JSON lines. They don't include names or request bodies.
- **No card or bank data** is collected. A payment has only an amount and a booking reference.

## Demo limitations (known, not fixed)

- **No authentication.** The `X-Demo-User-Id` header can be forged, and user IDs are listed publicly for the selector. Ownership checks are correct *given* an identity; they don't prove the caller owns it. Replace `ActingUserResolver` with verified auth to fix this.
- **Unauthenticated user creation**, with no rate limiting (only a total cap).
- **In-memory, mutable state.** It's lost on restart and is not a tamper-proof audit trail.
- **Payments left `PENDING`** by a provider error stay held, with no resolution path until the bonus milestone.
- **The UI's double-submit guard is not server-side idempotency.** It only stops repeated clicks in that browser tab.
- **API responses aren't validated at runtime by the web client.** It trusts its own backend's contract.
- **Concurrency safety rests on Node's single thread.** Ledger methods never `await`. A database-backed version would need transactions or conditional updates.

## Deferred production requirements

Real authentication and sessions; a persistent database with transactions; durable reconciliation and an outbox; provider webhooks with signature verification; an append-only audit log; rate limiting; idempotency keys on transfers; operator tooling for stuck payments; multi-currency; KYC/AML, fraud checks and limits; TLS, secrets management and observability; refunds and chargebacks.

## Stack

Node 24.22.0 LTS · TypeScript 6.0.3 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) · NestJS 12.1.3 · zod 4.6.7 · React 19.3.1 · Vite 8.3.4 · Vitest 5.0.5 · ESLint 10 + typescript-eslint 8.72. `PLAN.md` §3 explains why each version was chosen. Exact versions are locked in `package-lock.json`.
