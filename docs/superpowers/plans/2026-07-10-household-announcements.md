# Household Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a household member announce a shopping run (so housemates add items before departure) or a cooking commitment ("I'm making this"), delivered as real Expo push notifications plus an in-app card.

**Architecture:** A new synced `announcements` table (plus `announcement_reactions` and a user-scoped `push_tokens` table) rides the existing PowerSync → upload-proxy write path (ADR-008). When an `announcements` PUT commits in `services/api`, a decoupled push module fans out Expo notifications to the household's stored tokens. A once-a-minute sweep sends the batched runner-summary ping. The client writes rows locally (offline-correct), registers its push token after the existing notification-permission flow, and renders active-announcement cards with reaction chips. Push and in-app feed derive from the same synced row, so they cannot disagree.

**Tech Stack:** TypeScript, Zod (`@breadbox/core`), Vitest, PowerSync (`@powersync/react-native`), Express + `pg` + `expo-server-sdk` (`services/api`), React Native / Expo (`expo-notifications`), Postgres.

**Build order:** shopping run first (Tasks 1–14), then cooking commitment (Tasks 15–18). Each phase is independently testable.

---

## File Structure

**New files:**
- `packages/core/src/announcements.ts` — Zod schemas (`Announcement`, `AnnouncementReaction`), enums, window-label + recipient + batch-eligibility pure helpers.
- `packages/core/src/announcements.test.ts` — vitest for the above.
- `infra/local-dev/docker/modules/database-postgres/init-scripts/07-announcements.sql` — fresh-volume DDL for `announcements`, `announcement_reactions`, `push_tokens`, and `shopping_list_items.run_id`. (Renumbers the publication script; see Task 5.)
- `infra/local-dev/docker/modules/database-postgres/migrations/0007_announcements.sql` — live-volume migration (idempotent, guarded publication adds).
- `services/api/src/push/expoClient.ts` — thin `expo-server-sdk` wrapper behind an interface (mockable).
- `services/api/src/push/fanOut.ts` — `fanOutAnnouncement()` + `sweepRunnerSummaries()` (the reusable module, decoupled from the proxy).
- `services/api/src/push/fanOut.test.ts` — vitest with a mock Expo client + mock pg client.
- `apps/mobile/src/features/announcements/announceRun.ts` — writes a `shopping_run` announcement row.
- `apps/mobile/src/features/announcements/registerPushToken.ts` — obtains + upserts the Expo push token.
- `apps/mobile/src/features/announcements/useActiveAnnouncements.ts` — live query hook for active cards.
- `apps/mobile/src/features/announcements/reactToAnnouncement.ts` — writes a reaction row.
- `apps/mobile/src/features/announcements/AnnouncementCard.tsx` — in-app card + reaction chips.
- `apps/mobile/src/features/announcements/AnnounceRunSheet.tsx` — window-chip compose sheet.
- `apps/mobile/src/features/announcements/pushResponder.ts` — deep-link on notification tap.

**Modified files:**
- `packages/core/src/index.ts` — export `./announcements.ts`.
- `services/api/package.json` — add `expo-server-sdk`.
- `services/api/src/routes/upload.ts` — allowlist the 3 tables + `run_id`; call `fanOutAnnouncement` after commit.
- `services/api/src/main.ts` — start the runner-summary sweep interval.
- `infra/local-dev/sync-config.yaml` — stream `announcements` + `announcement_reactions` (household_data) and `push_tokens` (user-scoped).
- `apps/mobile/src/data/powersync/schema.ts` — add the 3 tables + `run_id`; add row interfaces.
- `apps/mobile/src/features/shopping/addToShoppingList.ts` — stamp `run_id` when a run is active.
- `apps/mobile/src/features/shopping/ShoppingScreen.tsx` — announce button + active-run card.
- `apps/mobile/src/features/recipes/RecipeDetailScreen.tsx` — "I'm making this" button (cooking phase).
- `apps/mobile/App.tsx` — register push token + attach push responder on launch.

---

## Phase 1 — Shopping run

### Task 1: Core enums + schemas

**Files:**
- Create: `packages/core/src/announcements.ts`
- Test: `packages/core/src/announcements.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/announcements.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  parseAnnouncement,
  parseAnnouncementReaction,
  ANNOUNCEMENT_KINDS,
  ANNOUNCEMENT_STATUSES,
  REACTIONS,
} from "./announcements.ts";

describe("Announcement", () => {
  const run = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    householdId: "223e4567-e89b-12d3-a456-426614174000",
    kind: "shopping_run" as const,
    createdBy: "user-1",
    createdAt: "2026-07-10T12:00:00.000Z",
    status: "active" as const,
    departsAt: "2026-07-10T17:00:00.000Z",
    storeHint: "Kroger",
    updatedAt: Date.now(),
    deleted: false,
  };

  it("parses a valid shopping_run announcement", () => {
    expect(parseAnnouncement(run)).toEqual(run);
  });

  it("parses a valid cooking announcement", () => {
    const cook = {
      id: "323e4567-e89b-12d3-a456-426614174000",
      householdId: "223e4567-e89b-12d3-a456-426614174000",
      kind: "cooking" as const,
      createdBy: "user-1",
      createdAt: "2026-07-10T12:00:00.000Z",
      status: "active" as const,
      recipeId: "716429",
      recipeTitle: "Chicken Tikka",
      updatedAt: Date.now(),
      deleted: false,
    };
    expect(parseAnnouncement(cook)).toEqual(cook);
  });

  it("rejects an unknown kind", () => {
    expect(() => parseAnnouncement({ ...run, kind: "party" })).toThrow();
  });

  it("rejects a non-UUID id", () => {
    expect(() => parseAnnouncement({ ...run, id: "nope" })).toThrow();
  });

  it("exposes the known enum sets", () => {
    expect(ANNOUNCEMENT_KINDS).toContain("shopping_run");
    expect(ANNOUNCEMENT_KINDS).toContain("cooking");
    expect(ANNOUNCEMENT_STATUSES).toContain("active");
    expect(REACTIONS).toEqual(["thumbs_up", "party", "cant_tonight"]);
  });

  it("parses a valid reaction", () => {
    const reaction = {
      id: "423e4567-e89b-12d3-a456-426614174000",
      announcementId: run.id,
      householdId: run.householdId,
      userId: "user-2",
      reaction: "thumbs_up" as const,
      createdAt: "2026-07-10T12:05:00.000Z",
      updatedAt: Date.now(),
      deleted: false,
    };
    expect(parseAnnouncementReaction(reaction)).toEqual(reaction);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/announcements.test.ts`
Expected: FAIL — cannot resolve `./announcements.ts`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/announcements.ts`:

```typescript
/**
 * Announcement — cross-user household notifications (shopping runs + cooking
 * commitments). Synced like activity_events; the upload-proxy fans out Expo
 * pushes when an INSERT commits. Reactions reach the sender via sync only.
 *
 * This module is PURE (no platform / no IO): schema + parse at the read
 * boundary, plus the window-label / recipient / batch-eligibility helpers the
 * mobile app and API both reuse. Mirrors the notifications.ts pure-reconciler
 * split — side effects live in apps/mobile and services/api.
 */
import { z } from "zod";

export const ANNOUNCEMENT_KINDS = ["shopping_run", "cooking"] as const;
export const AnnouncementKind = z.enum(ANNOUNCEMENT_KINDS);
export type AnnouncementKind = z.infer<typeof AnnouncementKind>;

export const ANNOUNCEMENT_STATUSES = ["active", "done", "canceled"] as const;
export const AnnouncementStatus = z.enum(ANNOUNCEMENT_STATUSES);
export type AnnouncementStatus = z.infer<typeof AnnouncementStatus>;

export const REACTIONS = ["thumbs_up", "party", "cant_tonight"] as const;
export const Reaction = z.enum(REACTIONS);
export type Reaction = z.infer<typeof Reaction>;

export const Announcement = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  kind: AnnouncementKind,
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  status: AnnouncementStatus.default("active"),

  // shopping_run only
  departsAt: z.string().datetime().optional(),
  storeHint: z.string().max(80).optional(),

  // cooking only
  recipeId: z.string().optional(),
  recipeTitle: z.string().max(200).optional(),
  image: z.string().optional(),

  // sync bookkeeping
  updatedAt: z.number().int(),
  deleted: z.boolean().default(false),
});
export type Announcement = z.infer<typeof Announcement>;

export function parseAnnouncement(input: unknown): Announcement {
  return Announcement.parse(input);
}

export const AnnouncementReaction = z.object({
  id: z.string().uuid(),
  announcementId: z.string().uuid(),
  householdId: z.string().uuid(),
  userId: z.string(),
  reaction: Reaction,
  createdAt: z.string().datetime(),
  updatedAt: z.number().int(),
  deleted: z.boolean().default(false),
});
export type AnnouncementReaction = z.infer<typeof AnnouncementReaction>;

export function parseAnnouncementReaction(input: unknown): AnnouncementReaction {
  return AnnouncementReaction.parse(input);
}
```

Then add to `packages/core/src/index.ts` (after line 24, the `cookingDevice.ts` export):

```typescript
export * from "./announcements.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/announcements.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/announcements.ts packages/core/src/announcements.test.ts packages/core/src/index.ts
git commit -m "feat(core): Announcement + AnnouncementReaction schemas"
```

---

### Task 2: Window-label helper

The compose sheet offers window chips; each maps to a concrete `departsAt` ISO string and a human label. Keep the mapping pure and tested.

**Files:**
- Modify: `packages/core/src/announcements.ts`
- Test: `packages/core/src/announcements.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/announcements.test.ts`:

```typescript
import {
  RUN_WINDOWS,
  windowToDepartsAt,
  formatDepartureLabel,
} from "./announcements.ts";

describe("run windows", () => {
  const now = new Date("2026-07-10T14:00:00.000Z");

  it("lists the four window options", () => {
    expect(RUN_WINDOWS.map((w) => w.id)).toEqual([
      "now",
      "30min",
      "afternoon",
      "tonight",
    ]);
  });

  it("maps 'now' to the current instant", () => {
    expect(windowToDepartsAt("now", now)).toBe("2026-07-10T14:00:00.000Z");
  });

  it("maps '30min' to 30 minutes out", () => {
    expect(windowToDepartsAt("30min", now)).toBe("2026-07-10T14:30:00.000Z");
  });

  it("formats a departure label in local time", () => {
    // Uses the host tz like notifications.ts; assert via the same local call.
    const iso = "2026-07-10T17:00:00.000Z";
    const expected = new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    expect(formatDepartureLabel(iso)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/announcements.test.ts`
Expected: FAIL — `RUN_WINDOWS` / `windowToDepartsAt` / `formatDepartureLabel` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/core/src/announcements.ts`:

```typescript
/** Compose-sheet window options → offset minutes from "now". */
export const RUN_WINDOWS = [
  { id: "now", label: "Now", offsetMinutes: 0 },
  { id: "30min", label: "In ~30 min", offsetMinutes: 30 },
  { id: "afternoon", label: "This afternoon", offsetMinutes: 180 },
  { id: "tonight", label: "Tonight", offsetMinutes: 360 },
] as const;

export type RunWindowId = (typeof RUN_WINDOWS)[number]["id"];

/** Resolve a window id to a concrete departsAt ISO string. Pure. */
export function windowToDepartsAt(id: RunWindowId, now: Date): string {
  const win = RUN_WINDOWS.find((w) => w.id === id);
  if (!win) throw new Error(`unknown run window "${id}"`);
  return new Date(now.getTime() + win.offsetMinutes * 60_000).toISOString();
}

/** Human clock label for a departsAt, in the runtime's local timezone. */
export function formatDepartureLabel(departsAtIso: string): string {
  return new Date(departsAtIso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/announcements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/announcements.ts packages/core/src/announcements.test.ts
git commit -m "feat(core): run-window → departsAt mapping + departure label"
```

---

### Task 3: Recipient + push-message helpers

Given an announcement and the household's members/tokens, compute who to push and the notification copy. Pure — the API calls this, tests assert on it.

**Files:**
- Modify: `packages/core/src/announcements.ts`
- Test: `packages/core/src/announcements.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/announcements.test.ts`:

```typescript
import {
  recipientUserIds,
  announcementPushBody,
} from "./announcements.ts";

describe("recipientUserIds", () => {
  it("returns every member except the sender", () => {
    expect(
      recipientUserIds(["user-1", "user-2", "user-3"], "user-1"),
    ).toEqual(["user-2", "user-3"]);
  });

  it("dedupes and drops the sender", () => {
    expect(recipientUserIds(["a", "a", "b"], "b")).toEqual(["a"]);
  });
});

describe("announcementPushBody", () => {
  it("writes shopping-run copy with the sender name and store", () => {
    const msg = announcementPushBody(
      {
        kind: "shopping_run",
        storeHint: "Kroger",
        departsAt: "2026-07-10T17:00:00.000Z",
      },
      "Sam",
    );
    expect(msg.title).toBe("Sam is heading to the store");
    expect(msg.body).toContain("Kroger");
    expect(msg.body).toContain("Add anything you need");
  });

  it("writes cooking copy with sender and recipe", () => {
    const msg = announcementPushBody(
      { kind: "cooking", recipeTitle: "Chicken Tikka" },
      "Alex",
    );
    expect(msg.title).toBe("Alex is cooking tonight");
    expect(msg.body).toContain("Chicken Tikka");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/announcements.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/core/src/announcements.ts`:

```typescript
/** Household member ids minus the sender, deduped, order-preserving. */
export function recipientUserIds(
  memberUserIds: readonly string[],
  senderUserId: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of memberUserIds) {
    if (id === senderUserId || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export interface PushBody {
  title: string;
  body: string;
}

/** Notification copy for the fan-out. Sender name resolved by the caller. */
export function announcementPushBody(
  a: {
    kind: AnnouncementKind;
    storeHint?: string;
    departsAt?: string;
    recipeTitle?: string;
  },
  senderName: string,
): PushBody {
  if (a.kind === "shopping_run") {
    const where = a.storeHint ? ` to ${a.storeHint}` : "";
    return {
      title: `${senderName} is heading to the store`,
      body: `Shopping run${where}. Add anything you need to the list.`,
    };
  }
  const what = a.recipeTitle ? `: ${a.recipeTitle}` : "";
  return {
    title: `${senderName} is cooking tonight`,
    body: `Dinner's covered${what}.`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/announcements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/announcements.ts packages/core/src/announcements.test.ts
git commit -m "feat(core): recipient computation + push-body copy"
```

---

### Task 4: Batch-ping eligibility helper

The runner-summary sweep uses a pure predicate to decide if a run is due for its one batched ping.

**Files:**
- Modify: `packages/core/src/announcements.ts`
- Test: `packages/core/src/announcements.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/announcements.test.ts`:

```typescript
import { isRunnerSummaryDue, runnerSummaryBody } from "./announcements.ts";

describe("isRunnerSummaryDue", () => {
  const base = {
    status: "active" as const,
    departsAt: "2026-07-10T17:00:00.000Z",
    runnerSummarySentAt: null as string | null,
    requestedItemCount: 3,
  };
  // Sweep window: fire when now is within 5 min BEFORE departsAt.
  const near = new Date("2026-07-10T16:57:00.000Z"); // 3 min before
  const far = new Date("2026-07-10T16:40:00.000Z"); // 20 min before

  it("is due within 5 minutes of departure with requests", () => {
    expect(isRunnerSummaryDue(base, near)).toBe(true);
  });

  it("is not due when departure is far off", () => {
    expect(isRunnerSummaryDue(base, far)).toBe(false);
  });

  it("is not due once already sent", () => {
    expect(
      isRunnerSummaryDue(
        { ...base, runnerSummarySentAt: "2026-07-10T16:56:00.000Z" },
        near,
      ),
    ).toBe(false);
  });

  it("is not due with zero requested items", () => {
    expect(isRunnerSummaryDue({ ...base, requestedItemCount: 0 }, near)).toBe(
      false,
    );
  });

  it("is not due when the run is done", () => {
    expect(isRunnerSummaryDue({ ...base, status: "done" }, near)).toBe(false);
  });

  it("formats the summary body", () => {
    expect(runnerSummaryBody(5, 2)).toContain("5 items");
    expect(runnerSummaryBody(5, 2)).toContain("2 housemates");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/announcements.test.ts`
Expected: FAIL — `isRunnerSummaryDue` / `runnerSummaryBody` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/core/src/announcements.ts`:

```typescript
/** How far before departure the batched runner ping may fire. */
export const RUNNER_SUMMARY_LEAD_MS = 5 * 60_000;

/**
 * True when a run should get its one batched runner-summary push now:
 * active, not already sent, at least one requested item, and `now` within
 * the lead window before departsAt (but not past departure by more than the
 * lead — a long-offline sweep shouldn't fire a stale ping).
 */
export function isRunnerSummaryDue(
  run: {
    status: AnnouncementStatus;
    departsAt?: string;
    runnerSummarySentAt: string | null;
    requestedItemCount: number;
  },
  now: Date,
): boolean {
  if (run.status !== "active") return false;
  if (run.runnerSummarySentAt) return false;
  if (run.requestedItemCount <= 0) return false;
  if (!run.departsAt) return false;
  const departs = new Date(run.departsAt).getTime();
  const delta = departs - now.getTime();
  return delta <= RUNNER_SUMMARY_LEAD_MS && delta >= -RUNNER_SUMMARY_LEAD_MS;
}

export function runnerSummaryBody(
  itemCount: number,
  housemateCount: number,
): string {
  return `${housemateCount} housemates added ${itemCount} items to the list.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/announcements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/announcements.ts packages/core/src/announcements.test.ts
git commit -m "feat(core): runner-summary eligibility + body"
```

---

### Task 5: Postgres DDL — init-script + migration

Add the three tables and the `run_id` column. Follow the `activity_events` convention exactly: plain-TEXT enums (no CHECK — a client-violatable CHECK is the silent-sync-jam class), lockstep init-script + guarded migration, explicit publication add.

**Files:**
- Create: `infra/local-dev/docker/modules/database-postgres/init-scripts/07-announcements.sql`
- Create: `infra/local-dev/docker/modules/database-postgres/migrations/0007_announcements.sql`
- Rename: `06-powersync-publication.sql` → `08-powersync-publication.sql` (publication script must run last)

- [ ] **Step 1: Write the init-script**

Create `infra/local-dev/docker/modules/database-postgres/init-scripts/07-announcements.sql`:

```sql
-- announcements + announcement_reactions + push_tokens (Household Announcements).
-- Mirrors @breadbox/core Announcement / AnnouncementReaction. Enum-ish columns
-- (kind, status, reaction, platform) are plain TEXT with NO CHECK — a DB CHECK
-- the client can violate is the silent-sync-jam class migration 0002 fixed.
-- Core zod owns the allowed sets.
--
-- LOCKSTEP: created for existing volumes by migrations/0007_announcements.sql.
-- Runs BEFORE the publication script (renumbered 08-).

CREATE TABLE IF NOT EXISTS announcements (
  id                       UUID         PRIMARY KEY,
  household_id             UUID         NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  kind                     TEXT         NOT NULL,
  created_by               TEXT         NOT NULL,
  created_at               TIMESTAMPTZ  NOT NULL,
  status                   TEXT         NOT NULL DEFAULT 'active',
  departs_at               TIMESTAMPTZ,
  store_hint               TEXT,
  recipe_id                TEXT,
  recipe_title             TEXT,
  image                    TEXT,
  runner_summary_sent_at   TIMESTAMPTZ,
  updated_at               BIGINT       NOT NULL,
  deleted                  BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_announcements_household_active
  ON announcements (household_id, created_at DESC)
  WHERE deleted = FALSE;

CREATE TABLE IF NOT EXISTS announcement_reactions (
  id               UUID         PRIMARY KEY,
  announcement_id  UUID         NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  household_id     UUID         NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id          TEXT         NOT NULL,
  reaction         TEXT         NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL,
  updated_at       BIGINT       NOT NULL,
  deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_reactions_announcement
  ON announcement_reactions (announcement_id)
  WHERE deleted = FALSE;

-- push_tokens is USER-scoped, not household-scoped: a token is a device secret
-- and must never stream to co-members (see sync-config user_push_tokens rule).
CREATE TABLE IF NOT EXISTS push_tokens (
  id                     UUID     PRIMARY KEY,
  user_id                TEXT     NOT NULL,
  token                  TEXT     NOT NULL,
  platform               TEXT     NOT NULL,
  announcements_enabled  BOOLEAN  NOT NULL DEFAULT TRUE,
  updated_at             BIGINT   NOT NULL,
  deleted                BOOLEAN  NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_tokens_token
  ON push_tokens (token);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON push_tokens (user_id)
  WHERE deleted = FALSE AND announcements_enabled = TRUE;

-- run_id links a shopping-list item to the active run it was requested for, so
-- the runner's screen groups "requested this run" and the batch ping counts it.
ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS run_id UUID;
```

- [ ] **Step 2: Write the migration (guarded, idempotent)**

Create `infra/local-dev/docker/modules/database-postgres/migrations/0007_announcements.sql` with the SAME three `CREATE TABLE IF NOT EXISTS` + indexes + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS run_id UUID` as Step 1, then append the guarded publication adds:

```sql
-- (identical CREATE TABLE / index / ALTER statements from init-script 07 above)

-- Publication adds (explicit allowlist). Guarded so re-running is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'powersync' AND tablename = 'announcements') THEN
    ALTER PUBLICATION powersync ADD TABLE announcements;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'powersync' AND tablename = 'announcement_reactions') THEN
    ALTER PUBLICATION powersync ADD TABLE announcement_reactions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'powersync' AND tablename = 'push_tokens') THEN
    ALTER PUBLICATION powersync ADD TABLE push_tokens;
  END IF;
END $$;
```

- [ ] **Step 3: Ensure the publication script lists the new tables and runs last**

Rename so the publication script keeps running after the new table script:

```bash
git mv infra/local-dev/docker/modules/database-postgres/init-scripts/06-powersync-publication.sql \
       infra/local-dev/docker/modules/database-postgres/init-scripts/08-powersync-publication.sql
```

Read `08-powersync-publication.sql` and add `announcements`, `announcement_reactions`, and `push_tokens` to its `ALTER PUBLICATION powersync ADD TABLE ...` list, matching the existing style in that file (it already lists pantry_items … activity_events).

- [ ] **Step 4: Verify SQL applies against a fresh volume**

Run (requires Docker):
```bash
cd infra/local-dev && docker compose down -v && docker compose up -d database-postgres
```
Expected: Postgres starts clean, no errors in `docker compose logs database-postgres`. Confirm tables exist:
```bash
docker compose exec database-postgres psql -U postgres -c "\dt" | grep -E "announcements|push_tokens"
```
Expected: all three tables listed.

> If Docker is unavailable in the execution environment, skip the live apply and note it for manual QA; the DDL is mechanical and mirrors the reviewed activity_events pattern.

- [ ] **Step 5: Commit**

```bash
git add infra/local-dev/docker/modules/database-postgres/
git commit -m "feat(db): announcements, reactions, push_tokens tables + run_id"
```

---

### Task 6: PowerSync sync rules

Stream the household-scoped tables via `household_data`, and `push_tokens` via a new **user-scoped** stream (tokens are per-device secrets — never to co-members).

**Files:**
- Modify: `infra/local-dev/sync-config.yaml`

- [ ] **Step 1: Add the household_data queries**

In `infra/local-dev/sync-config.yaml`, inside `household_data.queries`, after the `activity_events` query (ends at line 76), add:

```yaml
      - |
        SELECT * FROM announcements
        WHERE household_id IN (
          SELECT household_id FROM user_households
          WHERE user_id = auth.user_id()
        )
      - |
        SELECT * FROM announcement_reactions
        WHERE household_id IN (
          SELECT household_id FROM user_households
          WHERE user_id = auth.user_id()
        )
```

- [ ] **Step 2: Add the user-scoped push_tokens stream**

Append a new top-level stream after `user_invites`:

```yaml
  # Per-user push tokens: a device push token is a secret and must NEVER stream
  # to co-members. Scoped strictly to the signed-in user's own rows, like
  # user_invites. The upload-proxy is the only writer besides the owning device.
  user_push_tokens:
    auto_subscribe: true
    queries:
      - |
        SELECT * FROM push_tokens
        WHERE user_id = auth.user_id()
```

- [ ] **Step 3: Mirror into the deployed sync-config**

The repo has a second copy at `powersync/sync-config.yaml` (deployed config). Apply the identical two edits there so local and deployed rules match. Read it first to confirm the same structure, then add the same blocks.

- [ ] **Step 4: Verify YAML validity**

Run:
```bash
cd infra/local-dev && docker compose restart powersync 2>/dev/null || true
node -e "require('js-yaml') && console.log('has js-yaml')" 2>/dev/null || npx --yes js-yaml infra/local-dev/sync-config.yaml >/dev/null && echo "YAML OK"
```
Expected: `YAML OK` (parse succeeds). If `js-yaml` isn't available, visually confirm indentation matches the surrounding streams.

- [ ] **Step 5: Commit**

```bash
git add infra/local-dev/sync-config.yaml powersync/sync-config.yaml
git commit -m "feat(sync): stream announcements + reactions; user-scoped push_tokens"
```

---

### Task 7: Upload-proxy allowlists

Teach the proxy the three new tables, their columns, tenancy, and PATCH-editable columns; add `run_id` to `shopping_list_items`.

**Files:**
- Modify: `services/api/src/routes/upload.ts`

- [ ] **Step 1: Write the failing test**

Create `services/api/src/routes/upload.announcements.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { validateCrudEntry } from './upload.js';

describe('validateCrudEntry — announcements', () => {
  const base = {
    op: 'PUT' as const,
    type: 'announcements',
    id: '123e4567-e89b-12d3-a456-426614174000',
    data: {
      household_id: '223e4567-e89b-12d3-a456-426614174000',
      kind: 'shopping_run',
      created_by: 'user-1',
      created_at: '2026-07-10T12:00:00.000Z',
      status: 'active',
      departs_at: '2026-07-10T17:00:00.000Z',
      store_hint: 'Kroger',
      updated_at: 1,
      deleted: false,
    },
  };

  it('accepts a well-formed announcement from its owner', () => {
    const r = validateCrudEntry(base, 'user-1');
    expect(r.ok).toBe(true);
  });

  it('rejects when created_by != JWT sub (tenancy)', () => {
    const r = validateCrudEntry(base, 'user-2');
    expect(r.ok).toBe(false);
  });

  it('accepts a push_tokens PUT owned by the caller', () => {
    const r = validateCrudEntry(
      {
        op: 'PUT',
        type: 'push_tokens',
        id: '323e4567-e89b-12d3-a456-426614174000',
        data: {
          user_id: 'user-1',
          token: 'ExponentPushToken[abc]',
          platform: 'ios',
          announcements_enabled: true,
          updated_at: 1,
          deleted: false,
        },
      },
      'user-1',
    );
    expect(r.ok).toBe(true);
  });

  it('rejects a push_tokens PUT for another user', () => {
    const r = validateCrudEntry(
      {
        op: 'PUT',
        type: 'push_tokens',
        id: '323e4567-e89b-12d3-a456-426614174000',
        data: { user_id: 'user-9', token: 't', platform: 'ios', updated_at: 1, deleted: false },
      },
      'user-1',
    );
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/api && npx vitest run src/routes/upload.announcements.test.ts`
Expected: FAIL — `unknown table "announcements"`.

- [ ] **Step 3: Implement the allowlist additions**

In `services/api/src/routes/upload.ts`:

Add to `KNOWN_TABLES` (after `'activity_events',`):
```typescript
  'announcements',
  'announcement_reactions',
  'push_tokens',
```

Add to `ALLOWED_COLUMNS`:
```typescript
  announcements: [
    'id',
    'household_id',
    'kind',
    'created_by',
    'created_at',
    'status',
    'departs_at',
    'store_hint',
    'recipe_id',
    'recipe_title',
    'image',
    'updated_at',
    'deleted',
    // NOTE: runner_summary_sent_at is server-only — deliberately NOT accepted
    // from the client, so a device can't suppress the batched runner ping.
  ],
  announcement_reactions: [
    'id',
    'announcement_id',
    'household_id',
    'user_id',
    'reaction',
    'created_at',
    'updated_at',
    'deleted',
  ],
  push_tokens: [
    'id',
    'user_id',
    'token',
    'platform',
    'announcements_enabled',
    'updated_at',
    'deleted',
  ],
```

Add `run_id` to the `shopping_list_items` array in `ALLOWED_COLUMNS` (after `'added_at',`):
```typescript
    'run_id',
```

Add to `USER_ID_COLUMNS`:
```typescript
  announcements: ['created_by'],
  announcement_reactions: ['user_id'],
  push_tokens: ['user_id'],
```

Add to `PATCH_ALLOWED_BY_TABLE` (so status changes, tombstones, and toggle edits work):
```typescript
  announcements: new Set(['status', 'deleted', 'updated_at']),
  announcement_reactions: new Set(['reaction', 'deleted', 'updated_at']),
  push_tokens: new Set(['announcements_enabled', 'token', 'deleted', 'updated_at']),
```

Add `'run_id'` to the existing `shopping_list_items` set in `PATCH_ALLOWED_BY_TABLE`.

> Tenancy note: `handlePatchPantryItem` reads `household_id` off the target row for the membership check. `push_tokens` has NO `household_id`. Add a branch: for `push_tokens`, check the target row's `user_id === userId` (same shape as the existing `user_households` branch). Insert this branch alongside the `user_households` special-case:
```typescript
  } else if (table === 'push_tokens') {
    const own = await client.query('SELECT user_id FROM push_tokens WHERE id = $1', [entry.id]);
    if ((own.rowCount ?? 0) === 0) {
      throw new UploadError(404, `${table} row "${entry.id}" not found`);
    }
    if (own.rows[0]?.user_id !== userId) {
      throw new UploadError(403, `tenancy: push_tokens row "${entry.id}" is not the caller's`);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/api && npx vitest run src/routes/upload.announcements.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add services/api/src/routes/upload.ts services/api/src/routes/upload.announcements.test.ts
git commit -m "feat(api): allowlist announcements/reactions/push_tokens + run_id"
```

---

### Task 8: Expo client wrapper

A thin, mockable interface over `expo-server-sdk` so `fanOut.ts` is testable without network.

**Files:**
- Modify: `services/api/package.json`
- Create: `services/api/src/push/expoClient.ts`

- [ ] **Step 1: Add the dependency**

```bash
cd services/api && npm install expo-server-sdk
```
Expected: `expo-server-sdk` appears under `dependencies` in `services/api/package.json`.

- [ ] **Step 2: Write the wrapper**

Create `services/api/src/push/expoClient.ts`:

```typescript
/**
 * Thin wrapper over expo-server-sdk. The fan-out module depends only on the
 * PushSender interface, so tests inject a recorder and no network is touched.
 * DeviceNotRegistered tickets are surfaced so the caller can tombstone tokens.
 */
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';

export interface PushSend {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  to: string;
  ok: boolean;
  /** true when Expo reports the token is no longer registered. */
  deviceNotRegistered: boolean;
}

export interface PushSender {
  send(messages: PushSend[]): Promise<PushResult[]>;
}

export function isExpoPushToken(token: string): boolean {
  return Expo.isExpoPushToken(token);
}

export function createExpoSender(): PushSender {
  const expo = new Expo();
  return {
    async send(messages) {
      const valid = messages.filter((m) => Expo.isExpoPushToken(m.to));
      const expoMessages: ExpoPushMessage[] = valid.map((m) => ({
        to: m.to,
        title: m.title,
        body: m.body,
        data: m.data,
        sound: 'default',
      }));
      const results: PushResult[] = [];
      for (const chunk of expo.chunkPushNotifications(expoMessages)) {
        let tickets: ExpoPushTicket[] = [];
        try {
          tickets = await expo.sendPushNotificationsAsync(chunk);
        } catch (err) {
          console.error('[push] chunk send failed:', err);
        }
        chunk.forEach((msg, i) => {
          const ticket = tickets[i];
          const ok = ticket?.status === 'ok';
          const dnr =
            ticket?.status === 'error' &&
            ticket.details?.error === 'DeviceNotRegistered';
          results.push({ to: String(msg.to), ok, deviceNotRegistered: Boolean(dnr) });
        });
      }
      return results;
    },
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd services/api && npm run typecheck`
Expected: no errors from `src/push/expoClient.ts`.

- [ ] **Step 4: Commit**

```bash
git add services/api/package.json services/api/package-lock.json services/api/src/push/expoClient.ts
git commit -m "feat(api): expo-server-sdk PushSender wrapper"
```

---

### Task 9: Fan-out module

`fanOutAnnouncement(row, deps)` looks up members, their enabled tokens, computes recipients + copy via core, sends, and tombstones dead tokens. `sweepRunnerSummaries(deps)` sends due batched pings. Both take injected pg + sender deps for testing.

**Files:**
- Create: `services/api/src/push/fanOut.ts`
- Test: `services/api/src/push/fanOut.test.ts`

- [ ] **Step 1: Write the failing test**

Create `services/api/src/push/fanOut.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { fanOutAnnouncement } from './fanOut.js';
import type { PushSender, PushResult } from './expoClient.js';

function fakeSender(results: PushResult[] = []): { sender: PushSender; sent: any[] } {
  const sent: any[] = [];
  return {
    sent,
    sender: {
      async send(messages) {
        sent.push(...messages);
        return results.length ? results : messages.map((m) => ({ to: m.to, ok: true, deviceNotRegistered: false }));
      },
    },
  };
}

// Minimal pg stub: queue query results in call order.
function fakePg(queue: any[][]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    client: {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: queue.shift() ?? [], rowCount: 0 };
      }),
    },
  };
}

const row = {
  id: 'a1',
  household_id: 'h1',
  kind: 'shopping_run',
  created_by: 'user-1',
  store_hint: 'Kroger',
  departs_at: '2026-07-10T17:00:00.000Z',
};

describe('fanOutAnnouncement', () => {
  it('pushes to every member except the sender', async () => {
    const { sender, sent } = fakeSender();
    const { client } = fakePg([
      // members
      [{ user_id: 'user-1', display_name: 'Sam' }, { user_id: 'user-2', display_name: 'Alex' }],
      // sender name lookup already covered by members; tokens for user-2:
      [{ token: 'ExponentPushToken[abc]', user_id: 'user-2' }],
    ]);
    await fanOutAnnouncement(row, { pg: client as any, sender });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('ExponentPushToken[abc]');
    expect(sent[0].title).toContain('Sam');
  });

  it('tombstones tokens reported DeviceNotRegistered', async () => {
    const { sender } = fakeSender([
      { to: 'ExponentPushToken[dead]', ok: false, deviceNotRegistered: true },
    ]);
    const { client, calls } = fakePg([
      [{ user_id: 'user-1', display_name: 'Sam' }, { user_id: 'user-2', display_name: 'Alex' }],
      [{ token: 'ExponentPushToken[dead]', user_id: 'user-2' }],
    ]);
    await fanOutAnnouncement(row, { pg: client as any, sender });
    const tombstone = calls.find((c) => /UPDATE push_tokens SET deleted/i.test(c.sql));
    expect(tombstone).toBeTruthy();
  });

  it('no-ops when the sender is the only member', async () => {
    const { sender, sent } = fakeSender();
    const { client } = fakePg([[{ user_id: 'user-1', display_name: 'Sam' }]]);
    await fanOutAnnouncement(row, { pg: client as any, sender });
    expect(sent).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/api && npx vitest run src/push/fanOut.test.ts`
Expected: FAIL — `./fanOut.js` not found.

- [ ] **Step 3: Write the implementation**

Create `services/api/src/push/fanOut.ts`:

```typescript
/**
 * Push fan-out for household announcements. Decoupled from the upload-proxy
 * internals (takes injected pg + sender) so it survives the ADR-008 backend
 * swap and stays unit-testable. Called AFTER the announcement row commits.
 */
import {
  recipientUserIds,
  announcementPushBody,
  isRunnerSummaryDue,
  runnerSummaryBody,
  type AnnouncementKind,
} from '@breadbox/core';
import type { PushSender } from './expoClient.js';

interface PgLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface FanOutDeps {
  pg: PgLike;
  sender: PushSender;
}

interface AnnouncementRow {
  id: string;
  household_id: string;
  kind: AnnouncementKind;
  created_by: string;
  store_hint?: string | null;
  departs_at?: string | null;
  recipe_title?: string | null;
}

export async function fanOutAnnouncement(row: AnnouncementRow, deps: FanOutDeps): Promise<void> {
  const { pg, sender } = deps;

  // Members at send time (departed members excluded). display_name for copy.
  const members = await pg.query(
    'SELECT user_id, display_name FROM user_households WHERE household_id = $1',
    [row.household_id],
  );
  const memberIds = members.rows.map((r) => r.user_id as string);
  const senderName =
    members.rows.find((r) => r.user_id === row.created_by)?.display_name ?? 'A housemate';

  const recipients = recipientUserIds(memberIds, row.created_by);
  if (recipients.length === 0) return;

  const tokenRows = await pg.query(
    `SELECT token, user_id FROM push_tokens
     WHERE user_id = ANY($1) AND deleted = FALSE AND announcements_enabled = TRUE`,
    [recipients],
  );
  if (tokenRows.rows.length === 0) return;

  const body = announcementPushBody(
    { kind: row.kind, storeHint: row.store_hint ?? undefined, departsAt: row.departs_at ?? undefined, recipeTitle: row.recipe_title ?? undefined },
    senderName,
  );

  const results = await sender.send(
    tokenRows.rows.map((t) => ({
      to: t.token as string,
      title: body.title,
      body: body.body,
      data: { announcementId: row.id, kind: row.kind, householdId: row.household_id },
    })),
  );

  const dead = results.filter((r) => r.deviceNotRegistered).map((r) => r.to);
  if (dead.length > 0) {
    await pg.query(
      'UPDATE push_tokens SET deleted = TRUE, updated_at = $1 WHERE token = ANY($2)',
      [Date.now(), dead],
    );
  }
}

/**
 * Finds active runs due for their one batched runner ping and sends it. Idempotent
 * per row via runner_summary_sent_at (stamped after send). Called on an interval.
 */
export async function sweepRunnerSummaries(deps: FanOutDeps, now: Date = new Date()): Promise<void> {
  const { pg, sender } = deps;
  const candidates = await pg.query(
    `SELECT a.id, a.household_id, a.created_by, a.departs_at, a.status,
            a.runner_summary_sent_at,
            (SELECT COUNT(*) FROM shopping_list_items s
               WHERE s.run_id = a.id AND s.deleted = FALSE) AS requested_count,
            (SELECT COUNT(DISTINCT s.added_by) FROM shopping_list_items s
               WHERE s.run_id = a.id AND s.deleted = FALSE AND s.added_by <> a.created_by) AS housemate_count
       FROM announcements a
      WHERE a.kind = 'shopping_run' AND a.status = 'active'
        AND a.runner_summary_sent_at IS NULL AND a.deleted = FALSE`,
    [],
  );

  for (const c of candidates.rows) {
    const due = isRunnerSummaryDue(
      {
        status: c.status,
        departsAt: c.departs_at ?? undefined,
        runnerSummarySentAt: c.runner_summary_sent_at ?? null,
        requestedItemCount: Number(c.requested_count),
      },
      now,
    );
    if (!due) continue;

    const tokenRows = await pg.query(
      `SELECT token FROM push_tokens
       WHERE user_id = $1 AND deleted = FALSE AND announcements_enabled = TRUE`,
      [c.created_by],
    );
    if (tokenRows.rows.length > 0) {
      await sender.send(
        tokenRows.rows.map((t) => ({
          to: t.token as string,
          title: 'Shopping list updated',
          body: runnerSummaryBody(Number(c.requested_count), Number(c.housemate_count)),
          data: { announcementId: c.id, kind: 'runner_summary' },
        })),
      );
    }
    // Stamp regardless of token presence so we never re-sweep this run.
    await pg.query('UPDATE announcements SET runner_summary_sent_at = NOW() WHERE id = $1', [c.id]);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/api && npx vitest run src/push/fanOut.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add services/api/src/push/fanOut.ts services/api/src/push/fanOut.test.ts
git commit -m "feat(api): announcement fan-out + runner-summary sweep"
```

---

### Task 10: Wire fan-out into the upload route + start the sweep

Call `fanOutAnnouncement` after the batch commits, for each `announcements` PUT. Start `sweepRunnerSummaries` on an interval in `main.ts`.

**Files:**
- Modify: `services/api/src/routes/upload.ts`
- Modify: `services/api/src/main.ts`

- [ ] **Step 1: Capture announcement PUTs during planning**

In `services/api/src/routes/upload.ts`, in the `/sync/upload` handler, collect the raw announcement rows as they're planned. After the `plan.push({ op: 'PUT', ... })` line, add capture:

```typescript
      plan.push({ op: 'PUT', table: result.table, columns: result.columns, values: result.values });
      if (result.table === 'announcements') {
        // Reconstruct a row object from column/value pairs for post-commit fan-out.
        const rowObj: Record<string, unknown> = {};
        result.columns.forEach((c, i) => (rowObj[c] = result.values[i]));
        announcementPuts.push(rowObj);
      }
```

Declare `const announcementPuts: Record<string, unknown>[] = [];` next to the `plan` declaration.

- [ ] **Step 2: Fire fan-out after COMMIT (fire-and-forget)**

Immediately after `await client.query('COMMIT');` and before `res.json(...)`, add:

```typescript
    // Fan-out is best-effort and MUST NOT block or fail the upload — the synced
    // row is the source of truth, the push is a convenience. Fire-and-forget.
    for (const rowObj of announcementPuts) {
      void fanOutAnnouncement(rowObj as any, { pg: pool, sender: getPushSender() }).catch((err) =>
        console.error('[api] announcement fan-out failed:', err),
      );
    }
```

Add imports at the top of `upload.ts`:
```typescript
import { fanOutAnnouncement } from '../push/fanOut.js';
import { getPushSender } from '../push/sender.js';
```

- [ ] **Step 3: Add a lazy sender singleton**

Create `services/api/src/push/sender.ts`:

```typescript
import { createExpoSender, type PushSender } from './expoClient.js';

let instance: PushSender | null = null;

/** Lazy singleton so route + sweep share one Expo client. */
export function getPushSender(): PushSender {
  if (!instance) instance = createExpoSender();
  return instance;
}
```

- [ ] **Step 4: Start the sweep interval in main.ts**

Read `services/api/src/main.ts`. After the server starts listening, add:

```typescript
import { sweepRunnerSummaries } from './push/fanOut.js';
import { getPushSender } from './push/sender.js';
import { pool } from './db.js';

// Batched runner-summary ping: check once a minute for runs entering their
// 5-min departure window. State lives in Postgres (runner_summary_sent_at),
// so this survives restarts and multiple instances stamp idempotently.
setInterval(() => {
  void sweepRunnerSummaries({ pg: pool, sender: getPushSender() }).catch((err) =>
    console.error('[api] runner-summary sweep failed:', err),
  );
}, 60_000).unref();
```

> If `main.ts` uses NestJS bootstrap rather than a bare Express listen, place the `setInterval` after `await app.listen(...)`. Match the file's existing import style (ESM `.js` specifiers).

- [ ] **Step 5: Typecheck + run the existing upload test suite**

Run:
```bash
cd services/api && npm run typecheck && npx vitest run src/routes/
```
Expected: typecheck clean; existing `household.test.ts` and both upload tests pass.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/routes/upload.ts services/api/src/main.ts services/api/src/push/sender.ts
git commit -m "feat(api): wire announcement fan-out + start runner-summary sweep"
```

---

### Task 11: Client schema + row interfaces

Add the three tables + `run_id` to the PowerSync client schema so the app can read/write them.

**Files:**
- Modify: `apps/mobile/src/data/powersync/schema.ts`

- [ ] **Step 1: Add the tables**

In `apps/mobile/src/data/powersync/schema.ts`, after the `activity_events` table definition (line 93), add:

```typescript
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
```

Add `run_id: column.text` to the existing `shopping_list_items` table definition (after `added_at`).

Register all three in the `AppSchema` object (after `activity_events,`):
```typescript
  announcements,
  announcement_reactions,
  push_tokens,
```

- [ ] **Step 2: Add row interfaces + extend ShoppingListItemRow**

Append after the existing `ActivityEventRow` interface:

```typescript
export interface AnnouncementRow {
  id: string;
  household_id: string;
  kind: string;
  created_by: string;
  created_at: string;
  status: string;
  departs_at: string | null;
  store_hint: string | null;
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
```

Add `run_id: string | null;` to the existing `ShoppingListItemRow` interface (after `added_at`).

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors (root typecheck is known-broken — use this per-package tsc, per docs).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/data/powersync/schema.ts
git commit -m "feat(mobile): PowerSync schema for announcements/reactions/push_tokens + run_id"
```

---

### Task 12: Push-token registration + announce-run writer + run_id stamping

**Files:**
- Create: `apps/mobile/src/features/announcements/registerPushToken.ts`
- Create: `apps/mobile/src/features/announcements/announceRun.ts`
- Modify: `apps/mobile/src/features/shopping/addToShoppingList.ts`

- [ ] **Step 1: Write the push-token registrar**

Create `apps/mobile/src/features/announcements/registerPushToken.ts`:

```typescript
/**
 * Obtains the Expo push token after notification permission is granted and
 * upserts it into the user-scoped push_tokens table (drains via upload-proxy).
 * Idempotent on the token's uniqueness — re-running refreshes updated_at.
 */
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { getPowerSync } from '../../data/powersync/db';
import { ensureNotificationPermission } from '../expiry/expoScheduler';

export async function registerPushToken(userId: string): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted) return;

  const tokenResponse = await Notifications.getExpoPushTokenAsync();
  const token = tokenResponse.data;
  if (!token) return;

  const db = getPowerSync();
  const existing = await db.getAll<{ id: string }>(
    'SELECT id FROM push_tokens WHERE token = ? AND deleted = 0 LIMIT 1',
    [token],
  );
  const now = Date.now();
  if (existing.length > 0) {
    await db.execute('UPDATE push_tokens SET updated_at = ? WHERE id = ?', [now, existing[0].id]);
    return;
  }
  await db.execute(
    `INSERT INTO push_tokens
       (id, user_id, token, platform, announcements_enabled, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [Crypto.randomUUID(), userId, token, Platform.OS, 1, now, 0],
  );
}
```

- [ ] **Step 2: Write the announce-run writer**

Create `apps/mobile/src/features/announcements/announceRun.ts`:

```typescript
/**
 * Writes a shopping_run announcement row locally; PowerSync + the upload-proxy
 * fan out the pushes. Returns the new announcement id so callers can stamp
 * subsequent list adds with run_id.
 */
import * as Crypto from 'expo-crypto';
import { windowToDepartsAt, type RunWindowId } from '@breadbox/core';

import { getPowerSync } from '../../data/powersync/db';

export async function announceRun(opts: {
  householdId: string;
  userId: string;
  window: RunWindowId;
  storeHint?: string;
}): Promise<string> {
  const db = getPowerSync();
  const id = Crypto.randomUUID();
  const now = new Date();
  await db.execute(
    `INSERT INTO announcements
       (id, household_id, kind, created_by, created_at, status, departs_at, store_hint, updated_at, deleted)
     VALUES (?, ?, 'shopping_run', ?, ?, 'active', ?, ?, ?, ?)`,
    [
      id,
      opts.householdId,
      opts.userId,
      now.toISOString(),
      windowToDepartsAt(opts.window, now),
      opts.storeHint ?? null,
      Date.now(),
      0,
    ],
  );
  return id;
}

/** The household's currently-active shopping run, if any (soonest first). */
export async function activeRunId(householdId: string): Promise<string | null> {
  const db = getPowerSync();
  const rows = await db.getAll<{ id: string }>(
    `SELECT id FROM announcements
     WHERE household_id = ? AND kind = 'shopping_run' AND status = 'active' AND deleted = 0
     ORDER BY created_at DESC LIMIT 1`,
    [householdId],
  );
  return rows[0]?.id ?? null;
}
```

- [ ] **Step 3: Stamp run_id in addToShoppingList**

In `apps/mobile/src/features/shopping/addToShoppingList.ts`, add an optional `runId` to the opts and include it in the INSERT. Change the signature:

```typescript
export async function addToShoppingList(opts: {
  householdId: string;
  userId: string;
  name: string;
  source: ShoppingSource;
  quantity?: number;
  unit?: string | null;
  runId?: string | null;
}): Promise<'added' | 'already'> {
```

Update the INSERT to include `run_id`:

```typescript
  await db.execute(
    `INSERT INTO shopping_list_items
       (id, household_id, name, quantity, unit, checked, source, added_by, added_at, run_id, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Crypto.randomUUID(),
      opts.householdId,
      opts.name,
      opts.quantity ?? 1,
      opts.unit ?? null,
      0,
      opts.source,
      opts.userId,
      new Date().toISOString(),
      opts.runId ?? null,
      Date.now(),
      0,
    ],
  );
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/announcements/registerPushToken.ts apps/mobile/src/features/announcements/announceRun.ts apps/mobile/src/features/shopping/addToShoppingList.ts
git commit -m "feat(mobile): push-token registration, announceRun, run_id stamping"
```

---

### Task 13: Active-announcements hook + reaction writer + card UI

**Files:**
- Create: `apps/mobile/src/features/announcements/useActiveAnnouncements.ts`
- Create: `apps/mobile/src/features/announcements/reactToAnnouncement.ts`
- Create: `apps/mobile/src/features/announcements/AnnouncementCard.tsx`
- Create: `apps/mobile/src/features/announcements/AnnounceRunSheet.tsx`

- [ ] **Step 1: Live query hook**

Create `apps/mobile/src/features/announcements/useActiveAnnouncements.ts`. Mirror the existing `useActivity.ts` watch pattern (read that file first for the exact `usePowerSync`/`watch` idiom this repo uses, then match it):

```typescript
/**
 * Live-queries the household's active announcements (both kinds) plus their
 * reaction rows, newest first. Follows the watch pattern in useActivity.ts.
 */
import { useEffect, useState } from 'react';

import { getPowerSync } from '../../data/powersync/db';
import type { AnnouncementRow, AnnouncementReactionRow } from '../../data/powersync/schema';

export interface ActiveAnnouncement extends AnnouncementRow {
  reactions: AnnouncementReactionRow[];
}

export function useActiveAnnouncements(householdId: string | null): ActiveAnnouncement[] {
  const [rows, setRows] = useState<ActiveAnnouncement[]>([]);

  useEffect(() => {
    if (!householdId) {
      setRows([]);
      return;
    }
    const db = getPowerSync();
    const controller = new AbortController();
    const load = async () => {
      const anns = await db.getAll<AnnouncementRow>(
        `SELECT * FROM announcements
         WHERE household_id = ? AND status = 'active' AND deleted = 0
         ORDER BY created_at DESC`,
        [householdId],
      );
      const reactions = await db.getAll<AnnouncementReactionRow>(
        `SELECT * FROM announcement_reactions WHERE household_id = ? AND deleted = 0`,
        [householdId],
      );
      setRows(
        anns.map((a) => ({
          ...a,
          reactions: reactions.filter((r) => r.announcement_id === a.id),
        })),
      );
    };
    void load();
    db.onChange(
      { onChange: () => void load() },
      { tables: ['announcements', 'announcement_reactions'], signal: controller.signal },
    );
    return () => controller.abort();
  }, [householdId]);

  return rows;
}
```

> Verify `db.onChange` signature against `useActivity.ts` — if this repo wraps watches differently (e.g. a `useQuery` from `@powersync/react-native`), use that wrapper instead. The query SQL stays the same.

- [ ] **Step 2: Reaction writer**

Create `apps/mobile/src/features/announcements/reactToAnnouncement.ts`:

```typescript
/** Upserts the caller's reaction to an announcement (one row per user/ann). */
import * as Crypto from 'expo-crypto';
import type { Reaction } from '@breadbox/core';

import { getPowerSync } from '../../data/powersync/db';

export async function reactToAnnouncement(opts: {
  announcementId: string;
  householdId: string;
  userId: string;
  reaction: Reaction;
}): Promise<void> {
  const db = getPowerSync();
  const existing = await db.getAll<{ id: string }>(
    'SELECT id FROM announcement_reactions WHERE announcement_id = ? AND user_id = ? LIMIT 1',
    [opts.announcementId, opts.userId],
  );
  const now = Date.now();
  if (existing.length > 0) {
    await db.execute(
      'UPDATE announcement_reactions SET reaction = ?, deleted = 0, updated_at = ? WHERE id = ?',
      [opts.reaction, now, existing[0].id],
    );
    return;
  }
  await db.execute(
    `INSERT INTO announcement_reactions
       (id, announcement_id, household_id, user_id, reaction, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [Crypto.randomUUID(), opts.announcementId, opts.householdId, opts.userId, opts.reaction, new Date().toISOString(), now, 0],
  );
}
```

- [ ] **Step 3: Card + sheet components**

Create `apps/mobile/src/features/announcements/AnnouncementCard.tsx` and `AnnounceRunSheet.tsx`. Before writing, read `apps/mobile/src/features/recipes/CookedItSheet.tsx` and one existing card component to match this repo's styling primitives (theme tokens, `Pressable` roles — recent commits added a11y button roles to prompt cards, so include `accessibilityRole="button"` on tappable chips). Build:

- `AnnouncementCard`: shows title (sender + action), departure label via `formatDepartureLabel`, request count for runs, and a reaction chip row (👍 🎉 "can't tonight") calling `reactToAnnouncement`; shows reaction counts/avatars for the sender. Tapping the card body deep-links (run → Shopping is already here; cooking → Recipe Detail).
- `AnnounceRunSheet`: renders `RUN_WINDOWS` as selectable chips + an optional store text input + a "Notify household" button that calls `announceRun`, then closes.

Keep each component focused; no business logic beyond calling the writers above.

- [ ] **Step 4: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/announcements/
git commit -m "feat(mobile): active-announcements hook, reactions, card + compose sheet"
```

---

### Task 14: Wire into ShoppingScreen + App launch (push token + responder + deep-link)

**Files:**
- Modify: `apps/mobile/src/features/shopping/ShoppingScreen.tsx`
- Create: `apps/mobile/src/features/announcements/pushResponder.ts`
- Modify: `apps/mobile/App.tsx`

- [ ] **Step 1: Push responder (deep-link on tap)**

Create `apps/mobile/src/features/announcements/pushResponder.ts`. Read `apps/mobile/src/navigation/navigationRef.ts` and `apps/mobile/src/features/expiry/notificationActions.ts` first to match the existing response-listener + navigation idiom:

```typescript
/**
 * Routes a tapped announcement notification to the right screen using the
 * shared navigationRef. Shopping-run + runner-summary → Shopping tab; cooking →
 * Recipe Detail. Attach once at app launch.
 */
import * as Notifications from 'expo-notifications';

import { navigate } from '../../navigation/navigationRef';

export function attachAnnouncementResponder(): { remove: () => void } {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as
      | { kind?: string; recipeId?: string }
      | undefined;
    if (!data) return;
    if (data.kind === 'cooking' && data.recipeId) {
      navigate('RecipeDetail', { recipeId: data.recipeId });
      return;
    }
    if (data.kind === 'shopping_run' || data.kind === 'runner_summary') {
      navigate('Shopping', undefined);
    }
  });
}
```

> Match `navigate`'s real export + route names from `navigationRef.ts` / `MainTabs.tsx`. If cooking pushes don't carry `recipeId` in `data`, add it to the fan-out `data` payload in Task 9's `announcementPushBody` call site (it already forwards `kind`/`announcementId`; add `recipeId` there when kind is cooking).

- [ ] **Step 2: Register token + responder at launch**

In `apps/mobile/App.tsx`, read the current launch effect (where the session/user becomes available and where `useExpiryNotifications` or similar is invoked). Add, once a `userId` is known:

```typescript
import { registerPushToken } from './src/features/announcements/registerPushToken';
import { attachAnnouncementResponder } from './src/features/announcements/pushResponder';

// ... inside the effect that runs after auth resolves:
void registerPushToken(userId);
const sub = attachAnnouncementResponder();
// cleanup: sub.remove();
```

Match the file's existing effect structure and cleanup conventions.

- [ ] **Step 3: Add the announce button + active-run card to ShoppingScreen**

In `apps/mobile/src/features/shopping/ShoppingScreen.tsx`, read the current header/layout first. Then:
- Render `useActiveAnnouncements(householdId)` results as `AnnouncementCard`s at the top (filter to `kind === 'shopping_run'` here; cooking cards live on Recipes).
- Add an "Announce a run" action (button/FAB matching existing screen affordances) that opens `AnnounceRunSheet`.
- When an active run exists, pass its id as `runId` into existing `addToShoppingList` call sites on this screen so new adds attach to the run.

- [ ] **Step 4: Typecheck + smoke the screen**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/App.tsx apps/mobile/src/features/announcements/pushResponder.ts apps/mobile/src/features/shopping/ShoppingScreen.tsx
git commit -m "feat(mobile): shopping-run cards + announce sheet; launch token + deep-link"
```

---

## Phase 2 — Cooking commitment

### Task 15: Cooking-announcement writer

**Files:**
- Create: `apps/mobile/src/features/announcements/announceCooking.ts`

- [ ] **Step 1: Write the writer**

Create `apps/mobile/src/features/announcements/announceCooking.ts`:

```typescript
/**
 * Writes a cooking announcement AND an activity_events row (so "I'm making X"
 * shows in History). PowerSync + upload-proxy fan out the pushes.
 */
import * as Crypto from 'expo-crypto';

import { getPowerSync } from '../../data/powersync/db';
import { recordActivity } from '../activity/recordActivity';

export async function announceCooking(opts: {
  householdId: string;
  userId: string;
  recipeId: string;
  recipeTitle: string;
  image?: string | null;
}): Promise<string> {
  const db = getPowerSync();
  const id = Crypto.randomUUID();
  const now = new Date();
  await db.execute(
    `INSERT INTO announcements
       (id, household_id, kind, created_by, created_at, status, recipe_id, recipe_title, image, updated_at, deleted)
     VALUES (?, ?, 'cooking', ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [id, opts.householdId, opts.userId, now.toISOString(), opts.recipeId, opts.recipeTitle, opts.image ?? null, Date.now(), 0],
  );
  await recordActivity({
    householdId: opts.householdId,
    userId: opts.userId,
    kind: 'cooking',
    label: opts.recipeTitle,
    refId: opts.recipeId,
    image: opts.image ?? null,
  });
  return id;
}
```

> Confirm `'cooking'` is acceptable to `ActivityKind` in `@breadbox/core` (activity.ts). Since `kind` is free TEXT server-side and core owns the set, if `ActivityKind` is a strict zod enum, add `'cooking'` to it in `activity.ts` (one-line enum extension) and note it in the commit. Read activity.ts to check before writing.

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors (extend `ActivityKind` if tsc flags the `kind` arg).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/announcements/announceCooking.ts packages/core/src/activity.ts
git commit -m "feat(mobile): cooking-announcement writer (+ history event)"
```

---

### Task 16: "I'm making this" button on Recipe Detail

**Files:**
- Modify: `apps/mobile/src/features/recipes/RecipeDetailScreen.tsx`

- [ ] **Step 1: Add the button**

Read `RecipeDetailScreen.tsx` to find the recipe object shape (id/title/image) and the current action-button area (near favorite/cook-mode actions). Add an "I'm making this" button that, on press, calls `announceCooking` with the household id (from `ActiveHouseholdContext`), current user id, and recipe fields, then shows a brief confirmation (match the existing toast/confirmation pattern on this screen). Guard against double-announce by disabling the button once an active cooking announcement exists for this recipe (query `announcements` where `recipe_id = ? AND status = 'active'`).

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/recipes/RecipeDetailScreen.tsx
git commit -m "feat(mobile): 'I'm making this' announce button on Recipe Detail"
```

---

### Task 17: Cooking cards on the Recipes screen

**Files:**
- Modify: `apps/mobile/src/features/recipes/RecipesScreen.tsx`

- [ ] **Step 1: Render cooking announcements**

In `RecipesScreen.tsx`, render `useActiveAnnouncements(householdId)` filtered to `kind === 'cooking'` as `AnnouncementCard`s at the top of the screen (reuse the same component; it already branches on `kind`). Tapping deep-links to Recipe Detail; reaction chips work as on the shopping card.

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/recipes/RecipesScreen.tsx
git commit -m "feat(mobile): cooking-announcement cards on Recipes screen"
```

---

### Task 18: Settings toggle + lifecycle expiry

**Files:**
- Modify: `apps/mobile/src/features/settings/SettingsScreen.tsx`
- Create: `apps/mobile/src/features/announcements/expireStaleAnnouncements.ts`

- [ ] **Step 1: "Household announcements" toggle**

In `SettingsScreen.tsx`, read the existing settings-row/switch pattern. Add a "Household announcements" switch (default on) that reads and writes `announcements_enabled` on the user's `push_tokens` row(s):

```typescript
// on toggle(value):
const db = getPowerSync();
await db.execute(
  'UPDATE push_tokens SET announcements_enabled = ?, updated_at = ? WHERE user_id = ? AND deleted = 0',
  [value ? 1 : 0, Date.now(), userId],
);
```

Read the current value from the same row on mount to seed the switch.

- [ ] **Step 2: Client-side lifecycle expiry**

Create `apps/mobile/src/features/announcements/expireStaleAnnouncements.ts`:

```typescript
/**
 * Marks stale active announcements 'done' so their cards disappear: shopping
 * runs ~4h past departure, cooking announcements past end-of-day. Idempotent;
 * call on app foreground alongside the expiry reconcile.
 */
import { getPowerSync } from '../../data/powersync/db';

const RUN_TTL_MS = 4 * 60 * 60_000;

export async function expireStaleAnnouncements(householdId: string): Promise<void> {
  const db = getPowerSync();
  const now = Date.now();
  const rows = await db.getAll<{ id: string; kind: string; departs_at: string | null; created_at: string }>(
    `SELECT id, kind, departs_at, created_at FROM announcements
     WHERE household_id = ? AND status = 'active' AND deleted = 0`,
    [householdId],
  );
  for (const r of rows) {
    let expired = false;
    if (r.kind === 'shopping_run' && r.departs_at) {
      expired = new Date(r.departs_at).getTime() + RUN_TTL_MS < now;
    } else if (r.kind === 'cooking') {
      const created = new Date(r.created_at);
      const endOfDay = new Date(created);
      endOfDay.setHours(23, 59, 59, 999);
      expired = now > endOfDay.getTime();
    }
    if (expired) {
      await db.execute('UPDATE announcements SET status = ?, updated_at = ? WHERE id = ?', ['done', now, r.id]);
    }
  }
}
```

Call `expireStaleAnnouncements(householdId)` where the app already reconciles on foreground (near the `useExpiryNotifications` foreground hook — read `useExpiryNotifications.ts` for the AppState 'active' trigger and add the call there).

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/features/settings/SettingsScreen.tsx apps/mobile/src/features/announcements/expireStaleAnnouncements.ts apps/mobile/src/features/expiry/useExpiryNotifications.ts
git commit -m "feat(mobile): announcements settings toggle + stale-card expiry"
```

---

## Final verification (whole feature)

- [ ] **Core + API test suites**

```bash
cd packages/core && npx vitest run src/announcements.test.ts
cd ../../services/api && npm run typecheck && npx vitest run
```
Expected: all green.

- [ ] **Mobile typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no new errors (root typecheck + retailBarcode.test.ts are known-broken; ignore those per docs/verification notes).

- [ ] **Manual QA (physical dev build — push can't be simulated)**

Two accounts in one household on two devices:
1. Device A announces a shopping run → Device B gets a push within a few seconds; tapping opens the Shopping tab.
2. Device B adds items before departure → Device A (runner) gets ONE batched summary push near the departure window, not one-per-item.
3. Device A opens Recipe Detail → "I'm making this" → Device B gets a cooking push; tap opens that recipe; a History row appears.
4. Reaction chips on B reflect on A's card.
5. Toggle "Household announcements" off on B → B stops receiving pushes but still sees in-app cards.

> Verify with the EAS dev build workflow (physical device; local ios/ is load-bearing — do NOT `prebuild --clean` on Windows).

---

## Notes for the implementer

- **Verification path:** root `tsc`/lint are known-broken; always use per-package (`cd apps/mobile && npx tsc --noEmit`, `cd services/api && npm run typecheck`). `retailBarcode.test.ts` has a pre-existing failure — not yours.
- **Enum-as-TEXT rule:** never add a DB CHECK to `kind`/`status`/`reaction`/`platform`. Core zod owns allowed sets; a client-violatable CHECK jams sync (the migration-0002 lesson).
- **Fan-out is best-effort:** it must never block or fail `/sync/upload`. The synced row is the source of truth.
- **push_tokens are secrets:** they must only ever stream to their owner (`user_push_tokens` rule). Never add them to `household_data`.
- **run_id / runner_summary_sent_at are server/flow-owned:** `runner_summary_sent_at` is intentionally excluded from the client `ALLOWED_COLUMNS` so a device can't suppress the runner ping.
