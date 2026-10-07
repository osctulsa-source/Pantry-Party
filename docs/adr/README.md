# Architecture Decision Records (foundation notes)

Longer-form ADRs that extend the numbered series in
[`docs/DECISIONS.md`](../DECISIONS.md). Each records **current behavior verified
against the code** plus a recommendation — written before real data volume /
real users, so the foundation's growth-sensitive decisions are explicit.

| ADR | Topic | Gist |
|---|---|---|
| [012](./ADR-012-offline-conflict-resolution.md) | Offline conflict resolution | Field-level, last-writer-to-*sync*-wins (arrival order, not edit time); no `updated_at` guard today. Acceptable at household scale; upgrade path documented. |
| [013](./ADR-013-sync-at-scale.md) | Sync at scale | Tenancy shape is efficient; the risk is unbounded history + never-purged tombstones riding the buckets. Window history + add a tombstone reaper before real volume. |
| [014](./ADR-014-rls-defense-in-depth.md) | RLS as defense-in-depth | Deny-by-default RLS is on for every `public` table (closes the PostgREST path; amended 2026-10). Per-request write-path policies stay deferred: don't flip them reflexively (reads bypass it; writes need per-request privilege drop). Revisit as a write-path backstop when stakes rise — with explicit triggers. |
