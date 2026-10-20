# Independent Reviews

Append-only. Each entry: milestone, snapshot (commit SHA), reviewer context, timestamps (Bogotá & UTC), verdict, findings, and resolutions.

Reviewers run as separate subagents with a fresh context. They receive only their responsibilities, the repo location, document paths, the milestone, the snapshot ID, the deadline, and a review budget — not the implementer's reasoning or conversation history. Reviewers do not edit implementation files.

---

## R-M0 — Plan review

- **Milestone:** M0 Planning · **Snapshot:** `d803c64`
- **Reviewer context:** fresh general-purpose subagent. It was given only its responsibilities, the repo path, doc paths, the milestone, the SHA, the deadline, and a ~10 min budget.
- **Requested:** 2026-10-19T19:16-05:00 (approx.; launched right after the 19:15:53 commit) · **Returned:** by 2026-10-19T19:17:45-05:00 (2026-10-20T00:17:45Z, first clock capture after the report; reported duration ≈ 88 s)
- **Verdict:** **PASS WITH LIMITATIONS** — no blocking flaw; H1 to be fixed before M6.
- **IDs checked:** R1–R12, B1–B4, AC1–AC20, S1–S13, §2.1–10, §4–§11, M0–M7.

| ID | Sev | Location | Finding (summary) | Resolution |
|---|---|---|---|---|
| H1 | High | PLAN §6.2–6.3 | Concurrent reconcile/retry on an UNKNOWN payment could both pass the status check across `await lookup()` and both release → money created. Late charge result unspecified. | PLAN A1.1 + A1.5: single synchronous compare-and-set `settle()`; late results go through it. New AC21. |
| M1 | Med | AC17 vs §6.3 | AC17 says not charged → FAILED; design re-charges on `not_found`. | PLAN A1.2: AC17 wording aligned with §6.3 (disclosed correction, B3 unchanged). |
| M2 | Med | §6.3 | Lookup failing forever leaves funds held with no terminal path. | PLAN A1.3: intentional; AC22; operator tooling in §11. |
| M3 | Med | §6.2–6.3 | Key reservation vs. failed hold / missing key undefined → phantom results. | PLAN A1.4: reservation + hold + create in one sync step; AC23. |
| L1 | Low | §6.2 | `Promise.race` leaves the original promise running. | PLAN A1.5. |
| L2 | Low | §4.4/S9 | `DEV_TOOLS` default unclear. | PLAN A1.6: default off. |
| L3 | Low | S1 | Validate `X-Demo-User-Id` format. | PLAN A1.7. |
| L4 | Low | §4.4 | Transfers have no idempotency key. | PLAN A1.8: [OPT] extra #1 / §11. |
| L5 | Low | §8 M1 | Nest ESM + Vitest + SWC wiring is a schedule risk. | PLAN A1.9: fallback at 0:45. |

**Checks not performed by reviewer (as reported):** Node 24.22.0 LTS status on nodejs.org; @swc/core, rxjs, and reflect-metadata versions and peers; any build (none exists yet). *Implementer note:* Node 24.22.0 "Krypton" LTS was checked against nodejs.org/dist/index.json during planning (TIMELOG E02).

**Re-review:** the amendments are documentation-only and map one-to-one to the findings. A focused re-check of A1 will be done together with the M1 scaffolding review rather than as a separate loop.

---

## R-A — Milestone A (backend core) review

- **Snapshot:** `260bacd` · **Reviewer context:** fresh general-purpose subagent (only responsibilities, repo path, doc paths, scope, SHA, deadline, ≈12 min budget). It reviewed a `git archive` extract of the snapshot; no repo files were modified.
- **Requested:** 2026-10-19T19:28:22-05:00 (00:28:22Z) · **Returned:** by 2026-10-19T19:30:53-05:00 (00:30:53Z) (first clock capture after the report; reported duration ≈ 106 s).
- **Verdict:** **PASS WITH LIMITATIONS** — 0 Blocking/High/Medium, 6 Low.
- **IDs checked:** R1–R8, R11 (R9/R10/R12 partially: docs/UI/process), AC1–AC13, S1–S13, A1.1, A1.6, A1.7.
- **Reviewer's own checks:** typecheck pass; eslint exit 0; tests 70/70; nest build exit 0. Three mutations of its own (transfers list unscoped, directory leaking balances, releasing on provider throw) were each caught by a failing test. TIMELOG E01–E07 elapsed math consistent.
- **Not performed by reviewer:** live curl, reading the PDF directly, line-by-line review of every test file, dependency audit.

| ID | Sev | Location | Finding | Resolution |
|---|---|---|---|---|
| F1 | Low | PLAN A1.7 vs `common/acting-user.ts` | Plan names the 401 code `UNKNOWN_USER`; the code uses `DEMO_USER_REQUIRED`. | PLAN amendment A2.1 records the real code name (append-only). |
| F2 | Low | `ledger.service.ts` release | A release may take a balance above `MAX_BALANCE_MINOR` (still a safe integer); this is intentional. | Documented in README (money rules). |
| F3 | Low | `POST /users` | Unbounded user creation means memory exhaustion is possible. | Fixed: global `MAX_USERS` cap → 422 `USER_LIMIT_REACHED`, plus a test. |
| F4 | Low | `payments.service.ts` provider error | 201 + `PENDING` with funds held could be misread as paid. | UI shows "provider did not confirm… funds are held"; README states it. Resolution itself is bonus scope. |
| F5 | Low | `payments.service.ts` settle default | A malformed real-adapter outcome → 500, payment stays PENDING (safe, untested). | Deferred: adapter-side validation noted in README for real providers. |
| F6 | Low | tests | 401 tested on one endpoint only; decline against the alternative provider untested; third-party view of `GET /transfers` only indirect. | Fixed: `it.each` 401 test over every acting-user endpoint; alternative provider decline test. (Third-party transfers view is already asserted in the AC5 test via Carol.) S12 log content is not tested (disclosed). |

---

## R-B — Milestone B (frontend + complete core) review

- **Snapshot:** `571be04` · **Reviewer context:** fresh general-purpose subagent (only responsibilities, repo path, doc paths, scope, SHA, deadline, ≈12 min budget). It worked on a `git archive` extract and did not modify the repo.
- **Requested:** 2026-10-19T19:35:18-05:00 (00:35:18Z) · **Returned:** by 2026-10-19T19:37:26-05:00 (00:37:26Z) (first clock capture after the report; reported duration ≈ 128 s).
- **Verdict:** **PASS WITH LIMITATIONS** — 0 Blocking/High/Medium, 5 Low.
- **IDs checked:** PDF core bullets (PDF read directly), R1–R12, AC1–AC13, AC19, AC20, A2.1–A2.3, R-A F1–F6 resolutions.
- **Reviewer's own checks:** `npm ci` + `npm run check` exit 0 (API 82/82, web 32/32). Live curl run of the snapshot API on port 3100 covering own and cross-user transfers, 0.29 → 29 cents, an unauthorized source (404), approved and declined payments with HOLD/RELEASE, isolation of reads, and strict-schema rejections. It also searched the production bundle for dev code. TIMELOG E07–E10 arithmetic consistent.
- **Not performed by reviewer:** a real-browser or screen-reader pass, a phone-width check, its own mutation testing, a dependency audit, and running the UI against the snapshot API (the user's dev servers held ports 3000/5173 at the candidate's request).

| ID | Sev | Location | Finding | Resolution |
|---|---|---|---|---|
| L1 | Low | `Activity.tsx` / `App.test.tsx` | No UI test that the Activity table shows FAILED payments as FAILED; no own-account transfer UI test; the UI tests use a fake API. | Fixed: the decline test now asserts the Activity row says FAILED (not SUCCEEDED); added an own-account transfer test (asserts the exact POST body in cents). The fake-API limitation is disclosed; the real UI↔API contract was checked by live smoke tests (TIMELOG E10). |
| L2 | Low | `TransferForm.tsx` | Changing From to the selected To leaves stale `toAccountId` (submit then blocked by native `required`; API would reject same-account anyway). | Fixed: From `onChange` clears a matching To. Test added for "never sends same-account". **Note:** a mutation check showed this test also passes without the fix, because native `required` already blocks the submit. The fix is a UX clarity change no automated test can isolate (disclosed). |
| L3 | Low | `App.tsx` | A failed refresh after a successful action replaced the whole dashboard. | Fixed: the last good data stays visible with a "Could not refresh… Showing the last loaded data." alert; test added. |
| L4 | Low | web bundle | Dev-panel API client functions ship in the production bundle (the route doesn't exist in production). | Accepted, not changed: harmless dead code; the server-side gating is what protects it. Noted here. |
| L5 | Low | `PaymentForm.tsx` | Decline message said "Declined: Declined by…". | Fixed wording: "Payment declined (reason) Your funds were returned." |

**Post-fix verification:** `npm run check` exit 0 — API 82/82, web 34/34, lint, typecheck, builds (2026-10-19T19:38:53-05:00).

### R-B2 — Focused re-review of the R-B fixes

- **Snapshot:** `e621c72` (diff against `571be04`) · **Reviewer context:** fresh general-purpose subagent, limited to R-B rows L1–L5, budget ≈6 min.
- **Requested:** 2026-10-19T19:39:22-05:00 (00:39:22Z) · **Returned:** by 2026-10-19T19:40:41-05:00 (00:40:41Z) (first clock capture after; reported ≈60 s).
- **Verdict:** **PASS WITH LIMITATIONS** — L1, L2, L3, L5 fixes do what they claim; L4 acceptance reasoned; **no regressions**. It verified that App.tsx never shows another user's data after a switch or failed refresh (`${userId}:` key prefix, cancelled stale loads) and that a stale error clears on the next good load. Its `npm run check`: exit 0, API 82/82, web 34/34.
- **Not performed by reviewer:** its own mutation test of the L2 test; a browser/live-API UI check; anything outside R-B.

| ID | Sev | Finding | Resolution |
|---|---|---|---|
| RB2-1 | Low | **Correction to R-B row L2 and TIMELOG E12:** the claim that "no automated test can isolate" the stale-To fix is wrong. Switching From back to the original account makes the stale option valid again, so it reappears as the recipient. | Fixed: the test now asserts To is empty after switching back. **Mutation check run by the implementer:** with the fix removed, this test fails (1 failed / 33 passed); with it restored, 34/34. The earlier disclosure in R-B/E12 is superseded by this entry (append-only; the original rows are left as written). |
| RB2-2 | Info | The L5 wording still repeated "declined". | Reworded: "Payment declined. Provider said: <reason> Your funds were returned." |

**Post-fix verification (2026-10-19T19:40:41-05:00):** `npm run check` exit 0 — API 82/82, web 34/34, lint, typecheck, builds.
**Milestone status:** A and B complete and reviewed. No unresolved Blocking/High/Medium findings. Accepted Low items: R-A F5 (adapter response validation deferred), R-B L4 (dev client code in prod bundle). Not covered: a real-browser and screen-reader pass.
