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
| `PROVIDER_TIMEOUT_MS` | `3000` | How long to wait for one provider call before treating its outcome as unknown |

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
| Pay for a room through the simulated provider (requires an `Idempotency-Key` header) | `POST /api/payments` | "Pay for a room" |
| Resolve an unconfirmed payment with the provider | `POST /api/payments/:id/reconcile` | "Check status" in Activity → Payments |
| Your payments and their status | `GET /api/payments`, `/:id` | "Activity → Payments" |
| Simulator scenario for new charges: approve, decline, timeout before charge, charge then lost response (dev only) | `GET /api/dev/provider`, `POST /api/dev/provider/mode` | "Simulated provider (dev only)" |

Every endpoint except `/users` and `/dev/*` needs the `X-Demo-User-Id` header.

## Money rules

- **One currency, USD. All amounts are integer cents** (`availableMinor`, `reservedMinor`, `amountMinor`). There's no floating-point money maths anywhere.
- **The API accepts only JSON integers**, from 1 to 100,000,000 cents ($1,000,000.00). Strings, decimals, zero, negatives, unsafe integers, and amounts above the cap get 400. Nothing is coerced or rounded.
- **The UI parses typed text using string operations.** `"12.34"` becomes `1234`. `"1.234"`, `"1e3"`, and `"1,000"` are rejected, not repaired (`apps/web/src/money.ts`).
- **Two buckets per account.** `availableMinor` is spendable. `reservedMinor` is held for payments the provider hasn't confirmed. Transfers and new payments can only use available funds.
- **Balance cap.** A transfer may not push an account's total (available + reserved) above $10,000,000,000.00 (422 `BALANCE_LIMIT_EXCEEDED`). Releasing a reservation moves money between buckets, so it never changes the total.
- **Funding.** There's no deposit endpoint. Money enters only through the startup seed (`apps/api/src/seed.ts`), recorded as `SEED` ledger entries. New users get money by receiving a transfer.

### Where the money flow lives

| File | Role |
|---|---|
| `apps/api/src/ledger/ledger.service.ts` | **The only code that changes balances.** `transfer`, `reserveForPayment`, `captureReservation`, `releaseReservation`, `seed`. Each one is synchronous and all-or-nothing: all checks first, then all writes. |
| `apps/api/src/transfers/transfers.service.ts` | Source-ownership check, then a ledger transfer, then the transfer record |
| `apps/api/src/payments/payments.service.ts` | Payment flow, idempotency, reconciliation, state machine (below) |
| `apps/api/src/payments/payment-provider.ts` | The provider interface: the seam for a real provider |
| `apps/api/src/payments/simulated-payment-provider.ts` | The stub provider, with its own books, separate from our ledger |
| `apps/api/src/common/money.ts` | Currency, limits, amount schema |
| `apps/api/src/common/acting-user.ts` | The single demo-identity boundary |

**Invariants (asserted after every test in the transfer and payment suites):**
- each bucket equals the sum of its ledger deltas and is never negative;
- an account's reserved funds equal the amounts of its unresolved (`PROCESSING`/`UNKNOWN`) payments;
- a transfer writes `TRANSFER_OUT −X` and `TRANSFER_IN +X` under one transfer ID, so the total of internal funds is unchanged.

### Payment semantics

| Ledger entry | available | reserved | When |
|---|---|---|---|
| `PAYMENT_RESERVE` | −X | +X | before the provider is contacted |
| `PAYMENT_CAPTURE` | | −X | the provider **confirmed** the charge (money leaves) |
| `PAYMENT_RELEASE` | +X | −X | the provider **definitively** declined |

**States and legal transitions** (`apps/api/src/payments/payments.service.ts`):

```
create ─reserve→ PROCESSING ─succeeded→ SUCCEEDED   capture, exactly once (terminal)
                      │     ─declined→  FAILED      release, exactly once (terminal)
                      └─timeout / error / lookup pending→ UNKNOWN   reservation kept
UNKNOWN ─reconcile or same-key retry→ PROCESSING → lookup → (not_found → re-charge with the SAME key) → …
```

- `PROCESSING`: funds reserved, and exactly one provider call for this payment is in flight.
- `UNKNOWN`: funds reserved, and the last provider call gave no definitive answer. **A timeout is never treated as a failure and never refunded automatically**, because the provider may have charged.
- Every transition is a synchronous compare-and-set done together with its ledger entry. Only the caller that moves a payment into `PROCESSING` may call the provider for it, so concurrent reconciles or retries can't double-capture or double-release. Late provider answers that arrive after our timeout are ignored; only a lookup settles an `UNKNOWN` payment.
- Amount, account, reference and the provider key always come from the **stored** payment. The provider key is always the server-generated payment ID, for the first charge, retries and lookups.

**Idempotency.** `POST /api/payments` requires `Idempotency-Key` (8–100 characters of `A–Z a–z 0–9 _ -`; the web app sends a UUID).
- The key is scoped to *(acting user, "payment", key)* and bound to the normalized payload `{accountId, amountMinor, reference}`.
- Same key and same payload → the same payment, with no new reservation or charge. If that payment is `UNKNOWN`, it is reconciled first.
- Same key and a different payload → **409** `IDEMPOTENCY_KEY_REUSED`.
- Another user's identical key is a separate scope, so it can't reveal or reuse the first user's payment.
- A rejected request (400, 404, 422) records no key.
- Simultaneous duplicates: the key, the reservation and the payment record are written in one synchronous step before the first `await`.

**Reconciliation.** `POST /api/payments/:id/reconcile` (owner only, safe to repeat), or the "Check status" button. It runs `lookup(paymentId)` and then:
- `succeeded` → capture;
- `declined` → release;
- `pending` or a lookup error → stays `UNKNOWN`, funds stay reserved;
- `not_found` → re-send the charge with the same key. `not_found` means "no record yet", not "will never be charged", so it's never treated as failure.

No background job: reconciliation runs only when the user asks or retries. Payments stay `UNKNOWN` until then.

**Simulated provider scenarios** (dev panel or `POST /api/dev/provider/mode`; deterministic, never random). Each applies to new charge keys, and a repeated key returns its stored outcome:

| Scenario | What happens |
|---|---|
| `approve` | Charge succeeds |
| `decline` | Definitive rejection; nothing charged |
| `timeout_before_charge` | The call times out; the provider recorded nothing |
| `charge_then_timeout` | The provider charges, then the response is lost |

The simulator's operation records are separate from the app's payments and ledger.

**Why reserve before charging?** The provider call is `await`ed. If we checked the balance, awaited, and then debited, two concurrent operations could both pass the check. Reserving first, before any `await`, closes that gap.

### Concurrency: what is guaranteed, and where

One strategy everywhere: **every check-and-mutate of money or payment state is a single synchronous function with no `await`.** That covers ledger methods and payment state transitions. Provider calls happen only outside them, and no lock is ever held across a network wait. Node runs one JavaScript task at a time, so these sections are atomic relative to every other request **in this process**. No account locks are needed, so there's no lock ordering to get wrong.

**Scope of the guarantees:** one Node process with in-memory state. There is **no crash recovery** (a restart loses payments, reservations and idempotency keys), **no durable idempotency**, and **no multi-instance safety**. A database-backed version would need transactions or conditional updates (`… WHERE available >= X`), a durable idempotency table, and a background reconciler.

### What a real provider must support

We don't assume every provider does all of this; it's a selection criterion:
1. **Idempotency keys on charge, with records retained for longer than any payment can stay `UNKNOWN`.** This is an assumption, not enforced: reconciliation has no age limit, so if a provider expired a key and its record, a late "Check status" that gets `not_found` would re-charge. A production version would stop auto-re-charging after the provider's retention window and hand the payment to an operator.
2. **Lookup by our key**, because after a lost response we never learn their charge ID.
3. **Definitive declines**: a decline means nothing was or will be charged for that key.
4. **Clear timeouts and errors** that the adapter can turn into "unknown" (throw).

Without key lookup, we'd need webhooks plus a different reconciliation design.

### Replacing the provider

Write a class that implements `PaymentProvider`:
- `charge`: resolve `succeeded` only when the provider confirmed the charge, `declined` only when it definitively refused, and **throw for anything ambiguous** (timeouts, 5xx, network);
- `lookup(key)`: return `succeeded`, `declined`, `pending` or `not_found`, and throw if the lookup itself fails.

Then change one binding in `apps/api/src/app.module.ts`:

```ts
{ provide: PAYMENT_PROVIDER, useClass: RealProviderAdapter }
```

The service, controller, and ledger don't change. A test (AC12) runs the payment flow against a different provider implementation to show this. A real adapter should also validate the provider's response shape. An unexpected shape currently ends in a 500 with the payment left unresolved and its funds reserved, which is safe but unhelpful.

## Security: implemented protections

- **Input validation:** zod `strictObject` on every body (unknown fields → 400), UUID checks on route IDs and on the demo header, a 16 kb JSON body limit, and safe 400s for malformed JSON.
- **Server-controlled state is never writable:** balance, owner, status, provider result, and IDs. Tests try to inject each one.
- **One acting-user boundary** (`ActingUserResolver`). A missing, malformed, or unknown ID → 401 `DEMO_USER_REQUIRED`. Body validation runs before identity resolution. Both reject without changing state.
- **Ownership** is checked on transfer source, payment source, account detail and history, and payment reads. A resource you don't own gives the **same 404 as one that doesn't exist**. Transfers are listed only to their sender and recipient.
- **Minimal recipient info:** the directory returns names and account IDs, never balances or history.
- **No partial mutations:** ledger methods validate everything before writing. Tests compare a deep snapshot of all financial state before and after each rejected request.
- **Payment outcomes come only from the provider via the backend.** Payment status reads, retries and reconciliation are owner-only (404 otherwise), and the reconcile endpoint ignores any request body.
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
- **Editing the payment form after an unconfirmed result starts a new payment** (new key), even if the fields are later changed back; the unconfirmed one is still resolved with "Check status". The first payment's funds stay reserved, so this can't overspend, but the UI doesn't warn about it.
- **Unconfirmed payments stay `UNKNOWN`** (funds reserved) until someone presses "Check status" or retries. There's no background reconciler and no operator tooling.
- **Single process, in memory:** no crash recovery, durable idempotency or multi-instance safety (see Concurrency).
- **Transfers have no idempotency key.** The UI's double-submit guard only stops repeated clicks in that browser tab, so a retried transfer *request* would run twice. Payments are protected server-side by `Idempotency-Key`.
- **API responses aren't validated at runtime by the web client.** It trusts its own backend's contract.

## Deferred production requirements

Real authentication and sessions; a persistent database with transactions; a durable idempotency store; a background reconciler and outbox; provider webhooks with signature verification; an append-only audit log; rate limiting; idempotency keys on transfers; operator tooling for stuck payments; multi-currency; KYC/AML, fraud checks and limits; TLS, secrets management and observability; refunds and chargebacks.

## Stack

Node 24.22.0 LTS · TypeScript 6.0.3 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) · NestJS 12.1.3 · zod 4.6.7 · React 19.3.1 · Vite 8.3.4 · Vitest 5.0.5 · ESLint 10 + typescript-eslint 8.72. `PLAN.md` §3 explains why each version was chosen. Exact versions are locked in `package-lock.json`.
