# Database migrations

Numbered, append-only, **idempotent** SQL files describing the path from any
older dev database to the current schema. The first two (0001 fill_level,
0002 drop location CHECK) established the convention — June 2026.

## The rules

1. **Numbered and append-only.** `NNNN_short_name.sql`, monotonically
   increasing. Never edit or reorder a migration that has been merged —
   add a new one.
2. **Idempotent.** Every statement must be safe to re-run
   (`ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, guarded `DO`
   blocks for named constraints). In **local dev** this means you can apply
   the lot, in order, any time — no bookkeeping needed for disposable data.
   In **production** the same files run through a `schema_migrations` ledger
   (`infra/managed/migrate.sh`) so each applies at most once; idempotency is
   the backstop, not the primary mechanism.
3. **Lockstep with init-scripts.** Every migration ALSO updates the
   corresponding `init-scripts/*.sql` file in the same PR. Init scripts
   describe the CURRENT schema (fresh volumes need no migrations);
   migrations describe the PATH (existing volumes apply only the new
   files). A PR that changes one without the other is wrong.

## Applying in local dev

Init scripts only run on FRESH Postgres volumes, so existing dev databases
apply migrations by piping each file into psql inside the pg-db container
(stdin pipe — no volume mount needed; the postgres image exposes
POSTGRES_USER / POSTGRES_DB in-container):

```
cd Pantry-Party
docker compose -f infra/local-dev/docker/docker-compose.yaml exec -T pg-db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < infra/local-dev/docker/modules/database-postgres/migrations/0001_pantry_items_fill_level.sql
docker compose -f infra/local-dev/docker/docker-compose.yaml exec -T pg-db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < infra/local-dev/docker/modules/database-postgres/migrations/0002_drop_location_check.sql
```

After schema-shape changes, restart the PowerSync service so replication
picks up the new relation shape:

```
docker compose -f infra/local-dev/docker/docker-compose.yaml restart powersync
```

Alternative: a full volume reset (`down` + remove the pg volume + `up`)
re-runs init scripts from scratch — fine when local data is disposable.

## Production

The production runner is **[`infra/managed/migrate.sh`](../../../../../managed/migrate.sh)**
— a `schema_migrations`-ledger runner that applies the init-scripts baseline
(`00`–`08`) then these numbered migrations (`0001`–`0009`), each at most once,
in one transaction per file. It is the documented pre-deploy step and is
exercised in CI against a throwaway Postgres on every PR. See
`infra/managed/README.md` → "Schema migrations". (The convention stays
tool-agnostic — numbered idempotent SQL also imports cleanly into node-pg-migrate,
dbmate, or Flyway — but `migrate.sh` is the one we run.)
