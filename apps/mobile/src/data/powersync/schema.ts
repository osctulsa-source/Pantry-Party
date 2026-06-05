/**
 * PowerSync client-side schema. Mirrors the Postgres tables that the sync rules
 * stream down for the current user. See:
 *   - infra/local-dev/docker/modules/database-postgres/init-scripts/00-households.sql
 *   - infra/local-dev/docker/modules/database-postgres/init-scripts/01-pantry-items.sql
 *   - infra/local-dev/sync-config.yaml
 *
 * Column types here are PowerSync's local-SQLite types — text/integer/real.
 * UUIDs, ISO timestamps, and enums all serialize as text. Booleans serialize
 * as integer (0/1). @breadbox/core's parsePantryItem handles the JS-side
 * validation when reading rows out.
 *
 * Note: PowerSync auto-manages an `id` column on every table — don't include
 * it explicitly here. The Postgres `id UUID PRIMARY KEY` maps to PowerSync's
 * implicit id column. user_households has a synthetic `id` server-side (see
 * 00-households.sql) precisely so this client-schema model works.
 */
import { Schema, Table, column } from '@powersync/react-native';

const pantry_items = new Table({
  household_id: column.text,
  name: column.text,
  brand: column.text,
  category: column.text,
  barcode: column.text,
  quantity: column.real,
  unit: column.text,
  location: column.text,
  added_at: column.text,
  expires_at: column.text,
  source: column.text,
  added_by: column.text,
  updated_at: column.integer,
  deleted: column.integer,
});

// households / user_households are downloaded from the sync stream AND written
// to locally by ensureDefaultHousehold() so a fresh user gets a pantry to live
// in without manual SQL provisioning. Local writes drain to Postgres via
// SupabaseConnector.uploadData → services/api (ADR-008, PR #8a).
const households = new Table({
  name: column.text,
  created_at: column.text,
  created_by: column.text,
});

const user_households = new Table({
  user_id: column.text,
  household_id: column.text,
  role: column.text,
  created_at: column.text,
});

// household_invites streams down via the user_invites sync rule (sync-config.yaml):
// the user only sees invite codes they personally created. Writes happen via the
// /household/invite backend endpoint — never from the client — so the client copy
// is effectively read-only despite PowerSync exposing it as a writable table.
// Mirrors infra/local-dev/docker/modules/database-postgres/init-scripts/02-household-invites.sql.
const household_invites = new Table({
  household_id: column.text,
  invite_code: column.text,
  created_by: column.text,
  created_at: column.text,
  expires_at: column.text,
  used_at: column.text,
  used_by: column.text,
});

export const AppSchema = new Schema({
  pantry_items,
  households,
  user_households,
  household_invites,
});

// Row shape SELECT returns. Kept here so consumers don't reach into PowerSync
// internals. parsePantryItem in @breadbox/core does the real validation; this
// is just for TS-level guidance.
export interface PantryItemRow {
  id: string;
  household_id: string;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  quantity: number;
  unit: string | null;
  location: string;
  added_at: string;
  expires_at: string | null;
  source: string;
  added_by: string;
  updated_at: number;
  deleted: number;
}
