/**
 * PowerSync client-side schema. Mirrors the Postgres tables that the sync rules
 * stream down for the current user. See:
 *   - infra/local-dev/docker/modules/database-postgres/init-scripts/00-households.sql
 *   - infra/local-dev/docker/modules/database-postgres/init-scripts/01-pantry-items.sql
 *   - infra/local-dev/docker/modules/database-postgres/migrations/ (schema evolution)
 *   - infra/local-dev/sync-config.yaml
 *
 * Column types here are PowerSync's local-SQLite types — text/integer/real.
 * UUIDs, ISO timestamps, and enums all serialize as text. Booleans serialize
 * as integer (0/1). @breadbox/core's parsePantryItem handles the JS-side
 * validation when reading rows out (via data/powersync/mapRow).
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
  // How full the (single, continuous) package is — 1/0.75/0.5/0.25, NULL =
  // not tracked (opt-in). Added by migrations/0001_pantry_items_fill_level.sql.
  fill_level: column.real,
});

// shopping_list_items: one shared list per household (August arc). Streams via
// the household_data sync rule; writes drain through the upload-proxy like
// pantry_items. Mirrors init-scripts/03-shopping-list-items.sql.
const shopping_list_items = new Table({
  household_id: column.text,
  name: column.text,
  quantity: column.real,
  unit: column.text,
  note: column.text,
  checked: column.integer,
  source: column.text,
  added_by: column.text,
  added_at: column.text,
  run_id: column.text,
  updated_at: column.integer,
  deleted: column.integer,
});

// favorite_recipes: recipes a household has saved (Favorites feature). Streams
// via household_data; writes drain through the upload-proxy. The full recipe
// rides in `payload` (JSON) so Recipe Detail opens instantly + offline.
// Mirrors init-scripts/04-favorite-recipes.sql and @breadbox/core FavoriteRecipe.
const favorite_recipes = new Table({
  household_id: column.text,
  recipe_id: column.integer,
  title: column.text,
  image: column.text,
  ready_minutes: column.integer,
  health_score: column.integer,
  payload: column.text,
  added_by: column.text,
  added_at: column.text,
  updated_at: column.integer,
  deleted: column.integer,
});

// activity_events: append-only household activity log (History feature) —
// cooked / used / tossed / expired / restocked. Streams via household_data;
// writes drain through the upload-proxy. `kind` is free text (core zod owns the
// known set). Mirrors init-scripts/05-activity-events.sql and ActivityEvent.
const activity_events = new Table({
  household_id: column.text,
  kind: column.text,
  ref_id: column.text,
  label: column.text,
  quantity: column.real,
  unit: column.text,
  image: column.text,
  meta: column.text,
  occurred_at: column.text,
  added_by: column.text,
  updated_at: column.integer,
  deleted: column.integer,
});

// announcements: cross-user household notifications (shopping runs + cooking).
// Streams via household_data; writes drain through the upload-proxy, which fans
// out Expo pushes. Mirrors init-scripts/07-announcements.sql + core Announcement.
const announcements = new Table({
  household_id: column.text,
  kind: column.text,
  created_by: column.text,
  created_at: column.text,
  status: column.text,
  departs_at: column.text,
  store_hint: column.text,
  message: column.text,
  recipe_id: column.text,
  recipe_title: column.text,
  image: column.text,
  runner_summary_sent_at: column.text,
  updated_at: column.integer,
  deleted: column.integer,
});

const announcement_reactions = new Table({
  announcement_id: column.text,
  household_id: column.text,
  user_id: column.text,
  reaction: column.text,
  created_at: column.text,
  updated_at: column.integer,
  deleted: column.integer,
});

// push_tokens: USER-scoped (never streams to co-members). Written locally on
// permission grant; the upload-proxy tombstones dead tokens server-side.
const push_tokens = new Table({
  user_id: column.text,
  token: column.text,
  platform: column.text,
  announcements_enabled: column.integer,
  updated_at: column.integer,
  deleted: column.integer,
});

// households / user_households are downloaded from the sync stream AND written
// to locally by ensureDefaultHousehold() so a fresh user gets a pantry to live
// in without manual SQL provisioning. Local writes drain to Postgres via
// SupabaseConnector.uploadData → services/api (ADRs 009 and 010).
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
  // Per-membership display name (Display-names arc). Streamed to co-members via
  // the household_members sync rule; written via the upload-proxy PATCH.
  display_name: column.text,
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
  shopping_list_items,
  favorite_recipes,
  activity_events,
  announcements,
  announcement_reactions,
  push_tokens,
});

export interface ShoppingListItemRow {
  id: string;
  household_id: string;
  name: string;
  quantity: number;
  unit: string | null;
  note: string | null;
  checked: number;
  source: string;
  added_by: string;
  added_at: string;
  run_id: string | null;
  updated_at: number;
  deleted: number;
}

// favorite_recipes row shape (Favorites feature). `payload` is the full
// SpoonacularRecipe as JSON; rowToFavoriteRecipe keeps it a string and
// favoriteToRecipe() parses it when opening Recipe Detail.
export interface FavoriteRecipeRow {
  id: string;
  household_id: string;
  recipe_id: number;
  title: string;
  image: string | null;
  ready_minutes: number | null;
  health_score: number | null;
  payload: string;
  added_by: string;
  added_at: string;
  updated_at: number;
  deleted: number;
}

// activity_events row shape (History feature). `kind` is free text; meta is
// optional kind-specific JSON. parseActivityEvent validates on read.
export interface ActivityEventRow {
  id: string;
  household_id: string;
  kind: string;
  ref_id: string | null;
  label: string;
  quantity: number | null;
  unit: string | null;
  image: string | null;
  meta: string | null;
  occurred_at: string;
  added_by: string;
  updated_at: number;
  deleted: number;
}

export interface AnnouncementRow {
  id: string;
  household_id: string;
  kind: string;
  created_by: string;
  created_at: string;
  status: string;
  departs_at: string | null;
  store_hint: string | null;
  message: string | null;
  recipe_id: string | null;
  recipe_title: string | null;
  image: string | null;
  runner_summary_sent_at: string | null;
  updated_at: number;
  deleted: number;
}

export interface AnnouncementReactionRow {
  id: string;
  announcement_id: string;
  household_id: string;
  user_id: string;
  reaction: string;
  created_at: string;
  updated_at: number;
  deleted: number;
}

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
  fill_level: number | null;
}
