/**
 * PowerSync client-side schema. Mirrors the Postgres `pantry_items` table
 * (see infra/local-dev/docker/modules/database-postgres/init-scripts/00-pantry-items.sql).
 *
 * Column types here are PowerSync's local-SQLite types — text/integer/real.
 * UUIDs, ISO timestamps, and enums all serialize as text. Booleans serialize
 * as integer (0/1). PowerSync's runtime validation handles the conversion;
 * @breadbox/core's parsePantryItem handles the JS-side type validation when
 * reading rows out.
 *
 * Note: PowerSync auto-manages an `id` column on every table — don't include
 * it explicitly here. The Postgres `id UUID PRIMARY KEY` maps to PowerSync's
 * implicit id column.
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

export const AppSchema = new Schema({ pantry_items });

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
