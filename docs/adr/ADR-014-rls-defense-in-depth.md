# ADR-014 · RLS as defense-in-depth: revisit, don't reflexively flip

**Status:** Accepted (decision to defer, with triggers) · **Date:** 2026-07-22
**Related:** ADR-007 (managed stack), the write chokepoint in
[`services/api/src/routes/upload.ts`](../../services/api/src/routes/upload.ts),
and P0-#2 in [`docs/AUDIT-2026-07-22.md`](../AUDIT-2026-07-22.md).

## Context

Postgres RLS is intentionally **off**. Tenancy is enforced in two application
layers only: the PowerSync sync rules (read path) and the `services/api` upload
chokepoint (write path). P0-#2 was a live demonstration of the failure mode of
that posture — a **single missed membership check on the write path meant full
cross-tenant write compromise, with no database backstop**. The fix (a shared
`authorizePutWrite` gate + real-DB negative tests, this remediation's Task 2)
closes today's hole and makes the *class* harder to reintroduce, but it does not
change the fundamental property: **one app-layer bug = full tenant breach**,
because nothing beneath the API disagrees.

## Decision

**Do NOT flip RLS on reflexively.** It interacts non-trivially with this stack,
and turning it on naively would break sync or writes:

- **Reads don't go through RLS.** PowerSync replicates as `powersync_role`, which
  is `BYPASSRLS` (it must see every row to build buckets). RLS would therefore
  add **zero** protection to the read path — that path is, and stays, the sync
  rules' job. RLS is purely a *write-path* belt.
- **The API writes as a privileged pooler role**, not as the end user. For RLS to
  protect writes, the API would have to drop privilege per request — e.g.
  `SET LOCAL app.user_id = <jwt sub>` inside each transaction — and every table
  would need `USING`/`WITH CHECK` policies keyed on
  `household_id IN (SELECT … WHERE user_id = current_setting('app.user_id'))`.
  That is real, testable design work, not a checkbox.
- **Direct-SQL admin paths** (migrations, the account-deletion cascade, ops) must
  keep bypassing policies, so role separation has to be deliberate.

Given that, flipping RLS today buys little (reads unaffected) at the cost of a
non-trivial policy layer that could silently break the write path — a bad trade
*right now*.

## But: weigh it in as stakes rise

RLS remains the right **belt-and-suspenders** for the write path once the cost of
a breach grows. Its value is exactly the backstop P0-#2 lacked: with
per-request `app.user_id` + `WITH CHECK` policies, a *future* missed API check
cannot corrupt or cross tenants, because the database itself rejects the write.

**Revisit RLS when any of these triggers fire:**

- Onboarding real (non-TestFlight) users / real PII beyond a pantry list.
- Adding a second write path to the DB (a new service, a webhook, a direct
  admin tool) — more writers = more places to miss the check.
- A near-miss or incident on the write-path tenancy gate.

**When revisiting:** prototype policies against the **staging** database
(this remediation's Task 5) first — never learn RLS's PowerSync interactions on
production. Scope the first pass to the write-path tables, keep `powersync_role`
`BYPASSRLS`, and add the per-request `SET LOCAL` in the upload transaction
alongside the existing `authorizePutWrite` gate (defense in depth, not
replacement).

## Consequences

- No change today. The current backstop is the hardened API gate + the real-DB
  negative-authorization tests, which is a materially stronger posture than at
  audit time.
- This ADR is the written trigger list so "RLS off, API is the only boundary"
  stays a *decision* with review points, not an unexamined default.
