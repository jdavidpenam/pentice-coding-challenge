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

---

## R-S — Senior bonus review

- **Snapshot:** `e62bded` (diff vs `1357184`) · **Reviewer context:** fresh general-purpose subagent, adversarial brief (state transitions, reservation accounting, synchronization, idempotency scope, provider ambiguity, authorization, test effectiveness, honesty of claims), budget ≈15 min. It worked on a scratch `git archive` copy at /tmp/rev-bonus; the repo was not modified.
- **Requested:** 2026-10-19T19:55:51-05:00 (00:55:51Z) · **Returned:** by 2026-10-19T19:58:26-05:00 (00:58:26Z) (first clock capture after the report; reported duration ≈137 s).
- **Verdict:** **PASS WITH LIMITATIONS** — 0 Blocking/High/Medium, 4 Low.
- **IDs checked:** B1–B4, AC14–AC18, AC21–AC23 (as applicable), A3.x (not every sub-clause line by line).
- **Reviewer's own checks:** `npm ci` + `npm run check` exit 0 (API 112/112, web 37/37). Ten mutations of its own, M1–M9 with M5 in two variants (a, b). Killed: timeout→release, not_found→decline, setImmediate gap before key write, different provider key on retry, reference dropped from fingerprint, replay skipping reconcile. Survived: claim guard and applyOutcome guard (unreachable; already disclosed), microtask gap before key write (L2), cap ignoring reserved (L1). Confirmed tests 3, 4, 11, and 12-late genuinely park the provider and force their interleavings, and that none of tests 1–14 is vacuous. The only `await`s in `src` are the two provider calls. TIMELOG E14/E15 consistent.
- **Not performed by reviewer:** browser-driven UI check; mutations of UI tests; live smoke.

| ID | Sev | Location | Finding | Resolution |
|---|---|---|---|---|
| S-L1 | Low | `ledger.service.ts` transfer cap | No test that the cap counts reserved funds (its mutant survived). | Fixed: new e2e test parks a charge on the destination, then a transfer that only exceeds the cap counting reserved → 422, state unchanged. Mutant now killed (1 failed / 113). |
| S-L2 | Low | `payment-safety` test 4 | Duplicate test caught a macrotask gap but not a microtask `await` before the key write. | Fixed: new test calls `PaymentsService.create()` without awaiting and asserts that key, reservation, and payment already exist synchronously. Microtask mutant now killed (1 failed / 113). |
| S-L3 | Low | README provider contract | Reconciliation has no age limit; if a real provider expires keys/records, a late `not_found` would re-charge. | Disclosed in README as an explicit assumption, with the production mitigation (stop auto re-charge after the retention window → operator). Not changed in code. |
| S-L4 | Low (UX) | `PaymentForm.tsx` | Editing the form after an UNKNOWN result starts a new payment (new key) without a warning; no overspend possible. | Accepted as deliberate "new intent"; disclosed in README limitations. |

**Post-fix verification (2026-10-19T19:58:46-05:00):** `npm run check` exit 0 — API 114/114, web 37/37, lint, typecheck, builds.

### R-S2 — Focused re-review of the R-S fixes

- **Snapshot:** `82d18d4` (diff vs `e62bded`: tests and docs only, no source changes) · **Reviewer context:** fresh general-purpose subagent, limited to rows S-L1 to S-L4, budget ≈7 min, scratch copy.
- **Requested:** 2026-10-19T19:59:12-05:00 (00:59:12Z) · **Returned:** by 2026-10-19T20:00:28-05:00 (2026-10-20T01:00:28Z).
- **Verdict:** **PASS.** The S-L1 mutant (cap ignoring reserved) is killed by exactly the new test. The S-L2 mutants are killed in three variants (microtask `await` before the key write, before the replay lookup, and before the reservation). README S-L3/S-L4 disclosures are accurate and not overclaiming. `npm run check` exit 0 (API 114/114, web 37/37).
- **Not performed:** manual UI walk-through of the S-L4 flow; anything outside S-L1 to S-L4.

| ID | Sev | Finding | Resolution |
|---|---|---|---|
| RS2-1 | Info | S-L4: editing the form back to its original values still uses a new key. | README limitation reworded to say so. |
| RS2-2 | Info | README provider items 1 and 2 both mentioned lookup by key. | Item 1 trimmed to charge keys + retention. |

**Milestone status — senior bonus: complete and reviewed.** No open Blocking/High/Medium findings. Accepted/disclosed: S-L3 (no reconcile age limit; provider retention assumption), S-L4 (new key after edits), unreachable defense-in-depth guards (claim/applyOutcome).

---

## R-CW — Calm wallet UI redesign review

- **Snapshot:** `63a7c8f` (diff vs `0f3ff80`) · **Reviewer context:** fresh general-purpose subagent: UI-only constraint, the 9 must-haves, breakpoints/theme, wiring correctness, test effectiveness (own mutations), TIMELOG claims. Budget ≈15 min, scratch copy at /tmp/rv63; the repo was not modified.
- **Requested:** 2026-10-19T20:58:13-05:00 (01:58:13Z) · **Returned:** by 2026-10-19T21:01:08-05:00 (02:01:08Z) (first clock capture after the report; reported duration ≈172 s).
- **Verdict:** **PASS WITH LIMITATIONS** — 0 Blocking/High, 1 Medium, 4 Low. All 9 must-haves met; constraint met (no changes to apps/api, api.ts, dashboard.ts, money.ts or its tests; tokens.css byte-identical; no component library).
- **Reviewer's own checks:** `npm run check` exit 0 (API 114/114, web 60/60). Five UI mutations: M1 always-new key, M2 Transfer "Sending…" removed, M4 check results cleared on refresh, M5 Transfer loading removed: all killed; M3 Pay "Contacting provider…" + `inFlight` removed: **survived**. Headless screenshots at 375 (dark) and 1280 (light); 768 captured but not inspected in detail. TIMELOG E20/E21 arithmetic and claims consistent.
- **Not performed by reviewer:** AA contrast measurement; interactive real-browser clicking; live provider walk-through; runtime theme toggle; pixel comparison with the prototype.

| ID | Sev | Location | Finding | Resolution |
|---|---|---|---|---|
| CW-M1 | Medium | `PayScreen.tsx` intent ref | The Idempotency-Key for an unconfirmed payment lived in a component ref, so a user switch (remount) or reload lost it; re-paying with identical details then created a second payment despite the copy "you won't be charged twice". | Fixed: new `lib/payment-intents.ts` keeps intents outside React, keyed by acting user + exact payload, mirrored to sessionStorage (try/catch; in-memory if unavailable). New UI test: Unconfirmed → switch to Bob and back → same details → same key, dedupe note shown. **Mutation check by the implementer:** clearing intents on every Pay mount (the old behaviour) fails exactly that test (1 failed / 61). Limit: a new browser tab or session has no record, so it would start a new payment (disclosed). |
| CW-L1 | Low (tests) | `App.test.tsx` | No test for Pay's "Contacting provider…" label or `inFlight` guard (M3 survived). | Fixed: new test with a delayed provider and a double click asserts the disabled "Contacting provider…" button and one POST. Mutant M3 now killed (1 failed / 61). |
| CW-L2 | Low | `TransferScreen.tsx` review sheet | "{From} after" showed a negative client-computed balance when the amount exceeded available. | Fixed: the estimate row is hidden when amount > available; the server's insufficient-funds message remains the only verdict. |
| CW-L3 | Low (a11y) | `Sheet.tsx` | When locked, the focused Send button became disabled and focus fell to `<body>`; Tab could leave the dialog. | Fixed: panel is `tabIndex=-1` and receives focus when locking if focus is outside it; Tab is swallowed when nothing inside is focusable. Not covered by an automated test. |
| CW-L4 | Low | `theme.ts` | Theme did not follow live OS `prefers-color-scheme` changes. | Fixed: `followSystemTheme` listener applies OS changes until the viewer has a saved choice or a `?theme=` override. Not covered by an automated test (jsdom has no matchMedia; guarded). |

**Post-fix verification (2026-10-19T21:03:08-05:00):** `npm run check` exit 0 — API 114/114, web 62/62, lint, typecheck, builds.
