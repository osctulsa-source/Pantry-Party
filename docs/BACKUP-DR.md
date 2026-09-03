# Backup & Disaster Recovery

Runbook for protecting and recovering production data on the managed stack
(Supabase + PowerSync Cloud + Railway). Provisioning details live in
[`infra/managed/README.md`](../infra/managed/README.md); the stack decision is
ADR-007 in [`docs/DECISIONS.md`](./DECISIONS.md).

> Some Supabase backup features (retention window, PITR granularity) depend on
> your current plan and add-ons. Where this doc gives numbers, **confirm them
> against your live project settings** and update this file.

---

## 1. What actually needs backing up

The only stateful store of user data is **Supabase Postgres**. Everything else
is either derived from it or reproducible from the repo.

| Component | Source of truth? | Backup / recovery approach |
|---|---|---|
| **Supabase Postgres** (11 tables in `public`: 10 PowerSync-published + `analytics_events`) | **YES — the only one** | Supabase automated backups + PITR (§2); optional independent `pg_dump` (§2c) |
| **Supabase Auth** (users, in the `auth` schema) | YES | Same Supabase project → covered by the same backups/PITR |
| **PowerSync Cloud** | No — a derived replica + sync checkpoints | Re-replicates from Postgres after a restore (§4); nothing to back up |
| **Railway API** (`services/api`) | No — stateless | Redeploy from the repo; no data to restore |
| **Mobile devices** (local SQLite) | No — offline-first cache | Re-hydrate from sync; also a last-resort copy of a signed-in user's data during a backend outage |
| **Schema & migrations** | Repo (`infra/local-dev/docker/modules/database-postgres/` + `schema_migrations` ledger) | Version-controlled + idempotent; only *data* needs backup |
| **Object storage (item photos)** | none today | N/A until photos ship — **add the bucket to this scope then** |

Key point: because the schema is in the repo and PowerSync/Railway are
rebuildable, **disaster recovery reduces to "restore the Postgres data and
re-point the derived services."**

## 2. Backup mechanisms

**a. Supabase automated backups.** Supabase takes automated (typically daily)
backups on paid plans, retained for a plan-dependent window `[confirm: e.g. 7
days on Pro]`. These are managed for you in the dashboard (Database → Backups).

**b. Point-in-Time Recovery (PITR) — recommended, enable before TestFlight.**
PITR is a paid add-on that continuously archives WAL so you can restore to a
specific timestamp (fine granularity) rather than only to the last daily
snapshot. **This is the single biggest RPO improvement available** (see §3) and
directly mitigates the WAL/replication-slot class of issues already noted for
the sync layer. Enable it in Database → Backups → Point-in-Time Recovery and set
retention to `[7 / 14 / 28 days — pick per plan]`.

**c. Independent logical dump (defense-in-depth, recommended).** Supabase-managed
backups protect against data corruption inside the project, but **not** against
loss of the Supabase account/project itself. A periodic `pg_dump` stored
encrypted **off Supabase** (e.g. your own object storage) closes that gap and
keeps you provider-independent:

```sh
# Against the session-mode pooler (IPv4) or the direct endpoint. Captures both
# app data (public) and auth users (auth). Store the output encrypted, off-Supabase.
pg_dump "$PG_URI" \
  --schema=public --schema=auth \
  --no-owner --format=custom \
  --file "pantryparty-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Run it on a schedule `[daily/weekly]` from a trusted machine or CI job with a
read-capable role, encrypt at rest, and retain `[N]` copies. `[Automate this
before launch; a manual cadence is acceptable at TestFlight scale.]`

## 3. Recovery objectives (RPO / RTO)

| | Target | How we hit it |
|---|---|---|
| **RPO** (max acceptable data loss) | **≤ 5 minutes** | PITR (§2b). Without PITR, RPO is up to ~24h (last daily backup). |
| **RTO** (max acceptable downtime) | **≤ 1–2 hours** | Dashboard restore + re-point PowerSync; documented in §4. |

These are appropriate for the current pre-launch / TestFlight scale. Revisit and
tighten before a public launch with real users. `[Confirm the business is
comfortable with these numbers.]`

## 4. Recovery procedures

### Scenario A — Data corruption / bad write / accidental mass delete (same project)
1. Identify the last-good timestamp.
2. Supabase dashboard → Database → Backups → **restore** (PITR to the timestamp,
   or the most recent daily backup if PITR isn't enabled).
3. After the restore, **verify PowerSync** (§4, PowerSync note below): run
   `powersync fetch status --directory pulled` and confirm it's connected and
   replicating all 10 published tables.
4. Spot-check row counts and a sign-in + a device sync before declaring recovery.

### Scenario B — PowerSync replication broken (source DB intact)
PowerSync is a derived replica, so the data is safe in Postgres. If a restore or
a WAL/slot issue invalidated the replication slot, PowerSync re-establishes it
and **re-snapshots** from the current Postgres state (no data loss; it just
takes time to re-replicate).
1. `powersync fetch status --directory pulled` — check `connected` / replication
   lag / any slot error.
2. If needed, re-deploy the sync config:
   `PS_ROLE_PASSWORD=<powersync_role pw> powersync deploy --directory pulled`
   (see `infra/managed/README.md` §2). `sync-config.yaml` must stay byte-for-byte
   the repo's `infra/local-dev/sync-config.yaml`.
3. Confirm 10 tables replicating; clients re-sync automatically on reconnect.

### Scenario C — Full Supabase project / account loss (worst case)
This is where the independent `pg_dump` (§2c) earns its keep.
1. Create a new Supabase project; enable the **IPv4 add-on** (required for
   PowerSync's direct-endpoint replication) and PITR.
2. Apply the schema idempotently from the repo with the canonical runner
   (`DATABASE_URL=… ./infra/managed/migrate.sh` — the `schema_migrations` ledger
   model documented in `infra/managed/README.md` → "Schema migrations"), then
   re-create the `powersync` publication and `powersync_role`.
3. Restore data from the latest `pg_dump` (`pg_restore`). **Auth users** restore
   with the `auth` schema — validate sign-in works afterward; if the auth schema
   won't cleanly restore across projects, treat it as a pre-launch clean
   re-onboard `[acceptable while user-id values can still be reset]`.
4. Re-point the derived services to the new project:
   - PowerSync: update `service.yaml` connection to the new direct endpoint +
     role, `powersync deploy`, verify status.
   - Railway API: update `PG_URI`, `API_JWKS_URI`, `SUPABASE_URL`,
     `SUPABASE_SERVICE_ROLE_KEY` (see `docs/SECRETS.md`), redeploy.
   - Mobile: update the `EXPO_PUBLIC_*` set in `apps/mobile/eas.json` +
     `.env.local` and rebuild (these are bundled at build time).
5. Run the §5 verification.

## 5. Restore drill (rehearse — don't discover on the day)

A backup you've never restored is a hope, not a plan. Before TestFlight and
`[quarterly]` thereafter:
1. Restore the latest backup (or `pg_dump`) into a **scratch** Supabase project
   or branch — never over production.
2. Verify: row counts per table match expectations, a test user can sign in, and
   a device can sync household data down.
3. Record the date, what was restored, the measured RTO, and any surprises in a
   short log `[link or append here]`. Fix any step that didn't work and update
   this runbook.

## 6. Responsibilities

- **Automated / managed:** Supabase daily backups + PITR (once enabled).
- **Owner action (console):** enabling PITR, running/scheduling the independent
  `pg_dump`, and performing restores + drills.
- **Reproducible from repo:** schema, sync rules, API — no manual backup needed.
