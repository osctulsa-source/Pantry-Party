/**
 * rowToActivityEvent — the single SQLite-row → domain mapper for
 * activity_events (the mapRow.ts pattern: snake_case SQLite primitives →
 * validated camelCase domain shape; one mapper, every consumer imports it).
 */
import { parseActivityEvent, type ActivityEvent } from '@breadbox/core';

import type { ActivityEventRow } from './schema';

export function rowToActivityEvent(row: ActivityEventRow): ActivityEvent {
  return parseActivityEvent({
    id: row.id,
    householdId: row.household_id,
    kind: row.kind,
    refId: row.ref_id ?? undefined,
    label: row.label,
    quantity: row.quantity ?? undefined,
    unit: row.unit ?? undefined,
    image: row.image ?? undefined,
    meta: row.meta ?? undefined,
    occurredAt: row.occurred_at,
    addedBy: row.added_by,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  });
}
