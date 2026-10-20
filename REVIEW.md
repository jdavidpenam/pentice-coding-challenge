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
