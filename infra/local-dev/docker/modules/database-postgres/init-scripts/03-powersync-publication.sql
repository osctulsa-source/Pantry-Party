-- PowerSync logical replication requires a PostgreSQL publication.
-- Create a publication named "powersync" that includes EXACTLY the tables
-- referenced by the sync rules (sync-config.yaml).
--
-- DELIBERATELY NOT "FOR ALL TABLES" (changed June 2026, external review):
-- the publication controls what enters PowerSync's replication slot at all.
-- With FOR ALL TABLES, any future table (audit logs, billing, server-side
-- jobs) — and any column added to an existing table — starts replicating to
-- every client device the moment it exists, silently. The YAML sync rules
-- protect reads per-user, but the publication is the outer wall. An explicit
-- list means adding a synced table is a conscious two-file change:
--   1. ALTER PUBLICATION powersync ADD TABLE <new_table>;
--   2. add the stream to sync-config.yaml
--
-- Renumbered from 02- to 03- in PR A of Shared Household so the
-- 02-household-invites.sql table-creation script runs before this one
-- (a publication can only list tables that already exist).
--
-- Note: Init scripts run only when the Postgres data directory is empty (first
-- container start). Existing dev volumes keep the old FOR ALL TABLES
-- publication until reset. To apply this change to a live dev database without
-- a volume reset, run:
--   DROP PUBLICATION powersync;
--   CREATE PUBLICATION powersync FOR TABLE
--     households, user_households, pantry_items, household_invites;
-- then restart the powersync service container so it re-reads the slot.
-- Or do a full reset:
--   powersync docker stop --remove --remove-volumes && powersync docker reset

CREATE PUBLICATION powersync FOR TABLE
  households,
  user_households,
  pantry_items,
  household_invites;
