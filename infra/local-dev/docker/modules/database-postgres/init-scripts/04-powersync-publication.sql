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
-- Renumbered 03- → 04- in the shopping-list arc so 03-shopping-list-items.sql
-- creates its table first (a publication can only list existing tables) —
-- same precedent as the earlier 02- → 03- renumbering.
--
-- Note: Init scripts run only when the Postgres data directory is empty (first
-- container start). Existing dev volumes evolve via ../migrations/ instead —
-- migration 0003 ADDs shopping_list_items to the live publication (guarded).
-- After publication changes, restart the powersync service container so it
-- re-reads the slot.

CREATE PUBLICATION powersync FOR TABLE
  households,
  user_households,
  pantry_items,
  household_invites,
  shopping_list_items;
