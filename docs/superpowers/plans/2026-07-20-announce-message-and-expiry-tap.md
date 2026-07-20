# Announce Custom Message + Expiry Tap Affordance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user type a free-text note when announcing a shopping run (replacing the store-name-only field), and make the "food expiring/expired" pantry card visibly tappable.

**Architecture:** Fix 1 (custom message) is additive end-to-end — a new nullable `message` column added via Postgres migration, threaded through the Zod schema, PowerSync schema, upload-proxy allowlist, push-body builder (and its vendored copy), the compose sheet, and the in-app announcement card. `store_hint` stays in the schema (dead going forward) so nothing existing breaks. Fix 2 (expiry tap) is a single small JSX change in `PantryScreen.tsx`'s `StatusCard`. The two fixes are independent — do them in either order, but this plan does Fix 2 first since it's small and gives an early win, then Fix 1.

**Tech Stack:** React Native / Expo (mobile), Node/Express (services/api), Postgres (Supabase, live prod), PowerSync, Zod, Jest (mobile) / Vitest (packages/core, services/api).

---

## Task 1: Expiry card — always show the chevron when the row is tappable

**Files:**
- Modify: `apps/mobile/src/features/pantry/PantryScreen.tsx:829-834`

This is the whole fix for the expiry-tap bug. No new test file — there's no existing test coverage for `PantryScreen.tsx`'s `StatusCard`, and adding a full RN Testing Library harness for one JSX branch is out of proportion to the fix. Verification is a `tsc` check + manual visual check (Task 1 Step 3).

- [ ] **Step 1: Read the current `StatusCard` chevron block to confirm line numbers still match**

Run: `grep -n "collapsible &&" apps/mobile/src/features/pantry/PantryScreen.tsx`
Expected: a hit around line 829. If the line number has drifted, use the printed line number for the edit below instead of 829-834.

- [ ] **Step 2: Replace the collapsible-only chevron with a chevron shown whenever the row is pressable**

Find this block in `apps/mobile/src/features/pantry/PantryScreen.tsx` (inside the `StatusCard` function, in the `cardHeaderRight` `View`):

```tsx
          {collapsible &&
            (collapsed ? (
              <ChevronRight size={16} color={accent} accessibilityLabel="Expand" />
            ) : (
              <ChevronDown size={16} color={accent} accessibilityLabel="Collapse" />
            ))}
```

Replace it with:

```tsx
          {collapsible ? (
            collapsed ? (
              <ChevronRight size={16} color={accent} accessibilityLabel="Expand" />
            ) : (
              <ChevronDown size={16} color={accent} accessibilityLabel="Collapse" />
            )
          ) : (
            onHeaderPress && <ChevronRight size={16} color={accent} accessibilityLabel="View all" />
          )}
```

No import changes — `ChevronRight` and `ChevronDown` are already imported in this file (used by the block being replaced).

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 4: Manual visual check**

Run the app (`npx expo start` from `apps/mobile`, or the project's `run` skill), open the Pantry tab, and confirm:
- The "Use soon" card (if any items are expiring) now shows a right-pointing chevron next to the count, and tapping the header row navigates to the Expiring Soon screen.
- The "Expired" card (if any items are expired) shows the same chevron and navigates the same way.
- Collapsible zone cards (Fresh/Drinks/Shelf-stable) still show their expand/collapse chevron exactly as before — this fix must not change their behavior.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/pantry/PantryScreen.tsx
git commit -m "fix(pantry): show a chevron on expiring/expired cards so the tap target reads as tappable"
```

---

## Task 2: Postgres migration — add the `message` column

**Files:**
- Create: `infra/local-dev/docker/modules/database-postgres/migrations/0008_announcement_message.sql`
- Modify: `infra/local-dev/docker/modules/database-postgres/init-scripts/07-announcements.sql`

- [ ] **Step 1: Read the current init script to find the `announcements` table definition**

Run: `grep -n "CREATE TABLE.*announcements\|store_hint" infra/local-dev/docker/modules/database-postgres/init-scripts/07-announcements.sql`
Expected: a `CREATE TABLE announcements (...)` block containing a `store_hint` column line.

- [ ] **Step 2: Create the migration file**

Create `infra/local-dev/docker/modules/database-postgres/migrations/0008_announcement_message.sql`:

```sql
-- Migration 0008 — add announcements.message (free-text shopping-run note).
--
-- Replaces store_hint as the user-customizable part of the shopping-run
-- notification body. Additive only: store_hint stays in the table (unused
-- by new code) rather than being dropped, since this table is live in prod
-- and a destructive rename carries unnecessary risk for a one-line field.
--
-- Idempotent: safe to re-run.

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS message TEXT;
```

- [ ] **Step 3: Mirror the column in the init script so fresh local volumes match prod**

In `infra/local-dev/docker/modules/database-postgres/init-scripts/07-announcements.sql`, find the `announcements` table's `store_hint` column line (from Step 1) and add a `message` column directly after it, e.g. if the line reads:

```sql
  store_hint               TEXT,
```

change it to:

```sql
  store_hint               TEXT,
  message                  TEXT,
```

(Match whatever exact whitespace/alignment style the existing file uses — the migrations file `0007_announcements.sql` uses aligned columns; follow the init script's own existing alignment, don't necessarily copy 0007's.)

- [ ] **Step 4: Commit**

```bash
git add infra/local-dev/docker/modules/database-postgres/migrations/0008_announcement_message.sql infra/local-dev/docker/modules/database-postgres/init-scripts/07-announcements.sql
git commit -m "feat(db): add announcements.message column"
```

**Note:** this migration must be applied to the live Supabase database (prod) separately from this commit — running SQL migrations against prod is not something this plan automates. Flag this to the user before merging: they'll need to run migration 0008 against Supabase via their usual migration process (see `infra/managed/README.md` if unsure) before the app code that writes to `message` reaches production users, or writes will fail with an "unknown column" error.

---

## Task 3: `packages/core` — `message` field + updated `announcementPushBody`

**Files:**
- Modify: `packages/core/src/announcements.ts:25-46, 108-135`
- Modify: `packages/core/src/announcements.test.ts:124-147`

- [ ] **Step 1: Write the failing tests for the new message-based push body**

In `packages/core/src/announcements.test.ts`, replace the existing `describe("announcementPushBody", ...)` block (lines 124-147):

```ts
describe("announcementPushBody", () => {
  it("writes shopping-run copy using the sender's custom message", () => {
    const msg = announcementPushBody(
      {
        kind: "shopping_run",
        message: "Grabbing Kroger, need anything for tacos?",
        departsAt: "2026-07-10T17:00:00.000Z",
      },
      "Sam",
    );
    expect(msg.title).toBe("Sam is heading to the store");
    expect(msg.body).toBe("Grabbing Kroger, need anything for tacos?");
  });

  it("falls back to the default body when no message is given", () => {
    const msg = announcementPushBody(
      { kind: "shopping_run", departsAt: "2026-07-10T17:00:00.000Z" },
      "Sam",
    );
    expect(msg.title).toBe("Sam is heading to the store");
    expect(msg.body).toBe("Add anything you need to the list.");
  });

  it("falls back to the default body when the message is blank", () => {
    const msg = announcementPushBody(
      { kind: "shopping_run", message: "   ", departsAt: "2026-07-10T17:00:00.000Z" },
      "Sam",
    );
    expect(msg.body).toBe("Add anything you need to the list.");
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

Also update the `run` fixture at the top of the file (lines 19-30) — it currently has `storeHint: "Kroger"` which will now fail to parse since `storeHint` is being removed from the schema in the next step. Change it to:

```ts
  const run = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    householdId: "223e4567-e89b-12d3-a456-426614174000",
    kind: "shopping_run" as const,
    createdBy: "user-1",
    createdAt: "2026-07-10T12:00:00.000Z",
    status: "active" as const,
    departsAt: "2026-07-10T17:00:00.000Z",
    message: "Grabbing Kroger",
    updatedAt: Date.now(),
    deleted: false,
  };
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/core && npx vitest run src/announcements.test.ts`
Expected: FAIL — `parseAnnouncement` rejects `storeHint` is gone from fixture but schema still requires... actually expect failures on the new `announcementPushBody` assertions (body text mismatch) and/or a Zod parse issue if `message` isn't yet a known key. Either way: FAIL, not a crash from a typo.

- [ ] **Step 3: Update the Zod schema — drop `storeHint`, add `message`**

In `packages/core/src/announcements.ts`, find:

```ts
  // shopping_run only
  departsAt: z.string().datetime().optional(),
  storeHint: z.string().max(80).optional(),
```

Replace with:

```ts
  // shopping_run only
  departsAt: z.string().datetime().optional(),
  message: z.string().max(120).optional(),
```

- [ ] **Step 4: Update `announcementPushBody`'s input type and logic**

Find:

```ts
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

Replace with:

```ts
/** Notification copy for the fan-out. Sender name resolved by the caller. */
export function announcementPushBody(
  a: {
    kind: AnnouncementKind;
    message?: string;
    departsAt?: string;
    recipeTitle?: string;
  },
  senderName: string,
): PushBody {
  if (a.kind === "shopping_run") {
    const trimmed = a.message?.trim();
    return {
      title: `${senderName} is heading to the store`,
      body: trimmed ? trimmed : "Add anything you need to the list.",
    };
  }
  const what = a.recipeTitle ? `: ${a.recipeTitle}` : "";
  return {
    title: `${senderName} is cooking tonight`,
    body: `Dinner's covered${what}.`,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd packages/core && npx vitest run src/announcements.test.ts`
Expected: PASS, all tests including the untouched `run windows`, `recipientUserIds`, `isRunnerSummaryDue` suites.

- [ ] **Step 6: Run the full core test suite to check nothing else references `storeHint`**

Run: `cd packages/core && npx vitest run`
Expected: PASS. If another test file references `storeHint`, it will show up here — fix it the same way as Step 1 (rename to `message`, adjust the asserted value) before moving on.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/announcements.ts packages/core/src/announcements.test.ts
git commit -m "feat(core): replace announcement storeHint with free-text message"
```

---

## Task 4: `services/api` — vendored `announcementsCore.ts` + `fanOut.ts` + upload-proxy allowlist

**Files:**
- Modify: `services/api/src/push/announcementsCore.ts:40-62`
- Modify: `services/api/src/push/fanOut.ts:24-33, 66-74`
- Modify: `services/api/src/push/fanOut.test.ts:32-39`
- Modify: `services/api/src/routes/upload.ts:118-134`

This file (`announcementsCore.ts`) is a deliberate vendored copy of `packages/core/src/announcements.ts` — see its own header comment. `services/api` cannot import `@breadbox/core` at runtime (crashes prod — see the comment block at the top of `announcementsCore.ts`), so the same logic must be hand-copied here.

- [ ] **Step 1: Write the failing test for `fanOutAnnouncement` using a `message` field**

In `services/api/src/push/fanOut.test.ts`, find the `row` fixture:

```ts
const row = {
  id: 'a1',
  household_id: 'h1',
  kind: 'shopping_run' as const,
  created_by: 'user-1',
  store_hint: 'Kroger',
  departs_at: new Date(Date.now() + 1_800_000).toISOString(), // 30 min from now
};
```

Replace `store_hint: 'Kroger'` with `message: 'Grabbing Kroger'`:

```ts
const row = {
  id: 'a1',
  household_id: 'h1',
  kind: 'shopping_run' as const,
  created_by: 'user-1',
  message: 'Grabbing Kroger',
  departs_at: new Date(Date.now() + 1_800_000).toISOString(), // 30 min from now
};
```

Then extend the first test to assert the message flows into the push body. Find:

```ts
describe('fanOutAnnouncement', () => {
  it('pushes to every member except the sender', async () => {
    const { sender, sent } = fakeSender();
    const { client } = fakePg([
      // members
      [{ user_id: 'user-1', display_name: 'Sam' }, { user_id: 'user-2', display_name: 'Alex' }],
      // tokens for user-2:
      [{ token: 'ExponentPushToken[abc]', user_id: 'user-2' }],
    ]);
    await fanOutAnnouncement(row, { pg: client as any, sender });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('ExponentPushToken[abc]');
    expect(sent[0].title).toContain('Sam');
  });
```

Add one assertion line so the body is checked too:

```ts
describe('fanOutAnnouncement', () => {
  it('pushes to every member except the sender', async () => {
    const { sender, sent } = fakeSender();
    const { client } = fakePg([
      // members
      [{ user_id: 'user-1', display_name: 'Sam' }, { user_id: 'user-2', display_name: 'Alex' }],
      // tokens for user-2:
      [{ token: 'ExponentPushToken[abc]', user_id: 'user-2' }],
    ]);
    await fanOutAnnouncement(row, { pg: client as any, sender });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('ExponentPushToken[abc]');
    expect(sent[0].title).toContain('Sam');
    expect(sent[0].body).toBe('Grabbing Kroger');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd services/api && npx vitest run src/push/fanOut.test.ts`
Expected: FAIL — `sent[0].body` is currently `"Shopping run to Kroger. Add anything you need to the list."` (or similar, since `row.store_hint` no longer exists on the fixture and the code hasn't changed yet), not `"Grabbing Kroger"`.

- [ ] **Step 3: Update the vendored `announcementPushBody` in `announcementsCore.ts`**

In `services/api/src/push/announcementsCore.ts`, find:

```ts
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
  if (a.kind === 'shopping_run') {
    const where = a.storeHint ? ` to ${a.storeHint}` : '';
    return {
      title: `${senderName} is heading to the store`,
      body: `Shopping run${where}. Add anything you need to the list.`,
    };
  }
  const what = a.recipeTitle ? `: ${a.recipeTitle}` : '';
  return {
    title: `${senderName} is cooking tonight`,
    body: `Dinner's covered${what}.`,
  };
}
```

Replace with:

```ts
/** Notification copy for the fan-out. Sender name resolved by the caller. */
export function announcementPushBody(
  a: {
    kind: AnnouncementKind;
    message?: string;
    departsAt?: string;
    recipeTitle?: string;
  },
  senderName: string,
): PushBody {
  if (a.kind === 'shopping_run') {
    const trimmed = a.message?.trim();
    return {
      title: `${senderName} is heading to the store`,
      body: trimmed ? trimmed : 'Add anything you need to the list.',
    };
  }
  const what = a.recipeTitle ? `: ${a.recipeTitle}` : '';
  return {
    title: `${senderName} is cooking tonight`,
    body: `Dinner's covered${what}.`,
  };
}
```

Also update the module's header "KEEP IN SYNC" note if it lists field names explicitly — read the current header (lines 1-15) and, if it says `storeHint`, change it to `message` so future edits stay consistent. (It currently just says "if the copy there changes" without listing fields, so this may be a no-op — check before editing.)

- [ ] **Step 4: Update `fanOut.ts`'s `AnnouncementRow` interface and the call site**

In `services/api/src/push/fanOut.ts`, find:

```ts
interface AnnouncementRow {
  id: string;
  household_id: string;
  kind: AnnouncementKind;
  created_by: string;
  store_hint?: string | null;
  departs_at?: string | null;
  recipe_title?: string | null;
  recipe_id?: string | null;
}
```

Replace with:

```ts
interface AnnouncementRow {
  id: string;
  household_id: string;
  kind: AnnouncementKind;
  created_by: string;
  message?: string | null;
  departs_at?: string | null;
  recipe_title?: string | null;
  recipe_id?: string | null;
}
```

Then find:

```ts
  const body = announcementPushBody(
    {
      kind: row.kind,
      storeHint: row.store_hint ?? undefined,
      departsAt: row.departs_at ?? undefined,
      recipeTitle: row.recipe_title ?? undefined,
    },
    senderName,
  );
```

Replace with:

```ts
  const body = announcementPushBody(
    {
      kind: row.kind,
      message: row.message ?? undefined,
      departsAt: row.departs_at ?? undefined,
      recipeTitle: row.recipe_title ?? undefined,
    },
    senderName,
  );
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd services/api && npx vitest run src/push/fanOut.test.ts`
Expected: PASS, 4/4 tests.

- [ ] **Step 6: Update the upload-proxy's column allowlist so `message` writes aren't silently dropped**

In `services/api/src/routes/upload.ts`, find the `announcements` entry in the table-column allowlist:

```ts
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
```

Replace `'store_hint',` with `'message',` (keep `store_hint` out — the client no longer writes it, and there's no reason to keep accepting writes to a dead column):

```ts
  announcements: [
    'id',
    'household_id',
    'kind',
    'created_by',
    'created_at',
    'status',
    'departs_at',
    'message',
    'recipe_id',
    'recipe_title',
    'image',
    'updated_at',
    'deleted',
    // NOTE: runner_summary_sent_at is server-only — deliberately NOT accepted
    // from the client, so a device can't suppress the batched runner ping.
  ],
```

- [ ] **Step 7: Typecheck and run the full services/api test suite**

Run: `cd services/api && npx tsc --noEmit -p . && npx vitest run`
Expected: tsc clean; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add services/api/src/push/announcementsCore.ts services/api/src/push/fanOut.ts services/api/src/push/fanOut.test.ts services/api/src/routes/upload.ts
git commit -m "feat(api): thread announcements.message through fan-out and upload-proxy"
```

---

## Task 5: PowerSync schema — add `message` column

**Files:**
- Modify: `apps/mobile/src/data/powersync/schema.ts:99-113, 236-251`

- [ ] **Step 1: Add `message` to the `announcements` Table definition**

In `apps/mobile/src/data/powersync/schema.ts`, find:

```ts
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
```

Add `message: column.text,` after `store_hint`:

```ts
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
```

(`store_hint` stays in the PowerSync schema too — old synced rows may still carry it, and removing a column from a PowerSync `Table` definition the client has already synced can be its own headache. Leaving it as an unused, always-null-going-forward column costs nothing.)

- [ ] **Step 2: Add `message` to the `AnnouncementRow` TypeScript interface**

In the same file, find:

```ts
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
```

Add `message: string | null;` after `store_hint`:

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no new errors (there will likely be pre-existing errors in files this plan hasn't touched yet — Task 6-7 fix those; if `tsc` was clean before this step and picks up new errors specifically about `announceRun.ts` or `AnnouncementCard.tsx` referencing `storeHint`, that's expected and gets fixed in the next tasks).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/data/powersync/schema.ts
git commit -m "feat(powersync): add announcements.message column"
```

---

## Task 6: `announceRun.ts` — write `message` instead of `store_hint`

**Files:**
- Modify: `apps/mobile/src/features/announcements/announceRun.ts`

- [ ] **Step 1: Update the function signature and INSERT statement**

Find the full current contents of `apps/mobile/src/features/announcements/announceRun.ts`:

```ts
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
```

Replace the whole file with:

```ts
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
  message?: string;
}): Promise<string> {
  const db = getPowerSync();
  const id = Crypto.randomUUID();
  const now = new Date();
  await db.execute(
    `INSERT INTO announcements
       (id, household_id, kind, created_by, created_at, status, departs_at, message, updated_at, deleted)
     VALUES (?, ?, 'shopping_run', ?, ?, 'active', ?, ?, ?, ?)`,
    [
      id,
      opts.householdId,
      opts.userId,
      now.toISOString(),
      windowToDepartsAt(opts.window, now),
      opts.message ?? null,
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

(This carries forward the existing `activeRunId` function unchanged — it doesn't reference `store_hint`/`message` at all, just copied through since it's in the same file.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors from this file. (`AnnounceRunSheet.tsx` will now show a type error calling `announceRun({ ..., storeHint: ... })` — that's expected and fixed in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/announcements/announceRun.ts
git commit -m "feat(announcements): announceRun writes message instead of storeHint"
```

---

## Task 7: `AnnounceRunSheet.tsx` — free-text message input

**Files:**
- Modify: `apps/mobile/src/features/announcements/AnnounceRunSheet.tsx`

- [ ] **Step 1: Rename the state and wire it into `announceRun`**

In `apps/mobile/src/features/announcements/AnnounceRunSheet.tsx`, find:

```ts
  const [window, setWindow] = useState<RunWindowId>('30min');
  const [storeHint, setStoreHint] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (busy) return;
    setBusy(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const id = await announceRun({
        householdId,
        userId,
        window,
        storeHint: storeHint.trim() || undefined,
      });
      onDone(id);
    } catch {
      // best-effort — announceRun caught its own errors
    } finally {
      setBusy(false);
    }
  }
```

Replace with:

```ts
  const [window, setWindow] = useState<RunWindowId>('30min');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (busy) return;
    setBusy(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const id = await announceRun({
        householdId,
        userId,
        window,
        message: message.trim() || undefined,
      });
      onDone(id);
    } catch {
      // best-effort — announceRun caught its own errors
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 2: Swap the store-name `TextInput` for a message `TextInput`**

Find:

```tsx
          <TextInput
            style={styles.input}
            placeholder="Store (optional) — e.g., Kroger"
            placeholderTextColor={tokens.color.inkMuted}
            value={storeHint}
            onChangeText={setStoreHint}
            maxLength={80}
            autoCorrect={false}
            returnKeyType="done"
          />
```

Replace with:

```tsx
          <TextInput
            style={styles.input}
            placeholder="Add a note (optional) — e.g., Grabbing Kroger, need anything?"
            placeholderTextColor={tokens.color.inkMuted}
            value={message}
            onChangeText={setMessage}
            maxLength={120}
            autoCorrect
            multiline
            returnKeyType="done"
          />
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors from this file.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/features/announcements/AnnounceRunSheet.tsx
git commit -m "feat(announcements): free-text message field in the shopping-run sheet"
```

---

## Task 8: `AnnouncementCard.tsx` — show the message in the feed card

**Files:**
- Modify: `apps/mobile/src/features/announcements/AnnouncementCard.tsx`

- [ ] **Step 1: Update the `meta()` function**

Find:

```ts
  const meta = () => {
    if (isRun && announcement.departs_at) {
      return `Heads out around ${formatDepartureLabel(announcement.departs_at)}${announcement.store_hint ? ` · ${announcement.store_hint}` : ''}`;
    }
    if (!isRun && announcement.recipe_title) {
      return `Making ${announcement.recipe_title}`;
    }
    return null;
  };
```

Replace with:

```ts
  const meta = () => {
    if (isRun && announcement.departs_at) {
      const time = `Heads out around ${formatDepartureLabel(announcement.departs_at)}`;
      return announcement.message ? `${time} · ${announcement.message}` : time;
    }
    if (!isRun && announcement.recipe_title) {
      return `Making ${announcement.recipe_title}`;
    }
    return null;
  };
```

- [ ] **Step 2: Update the accessibility label**

Find:

```tsx
      accessibilityLabel={
        isRun
          ? `Shopping run${announcement.store_hint ? ` to ${announcement.store_hint}` : ''}`
          : `Cooking ${announcement.recipe_title ?? ''}`
      }
```

Replace with:

```tsx
      accessibilityLabel={
        isRun
          ? `Shopping run${announcement.message ? `: ${announcement.message}` : ''}`
          : `Cooking ${announcement.recipe_title ?? ''}`
      }
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: clean — this was the last file referencing `store_hint` on the mobile side (aside from the now-dead PowerSync/type field, which stays by design per Task 5).

- [ ] **Step 4: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest`
Expected: PASS, no regressions (no existing test files reference `AnnounceRunSheet`, `AnnouncementCard`, or `announceRun`, so this is a regression check on unrelated suites, not new coverage — matches the spec's noted test-scope decision).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/announcements/AnnouncementCard.tsx
git commit -m "feat(announcements): show the custom message on the announcement card"
```

- [ ] **Step 6: Manual verification on device/simulator**

Run the app, open the Shopping tab, tap "Notify household" (or wherever `AnnounceRunSheet` opens from), and check:
- The sheet shows "Add a note (optional)" instead of "Store (optional)".
- Typing a note and submitting shows the note in the in-app `AnnouncementCard` after the time (e.g. "Heads out around 5:30 · Grabbing Kroger, need anything?").
- Submitting with no note shows just the time, no trailing " · ".
- (If a second test device/household member is available) the push notification body is the typed note verbatim; with no note, it reads "Add anything you need to the list."

---

## Task 9: Cross-check nothing else references the old field name

**Files:** none modified — verification only.

- [ ] **Step 1: Grep the whole repo for lingering `storeHint`/`store_hint` references outside the intentionally-kept ones**

Run: `grep -rn "storeHint\|store_hint" --include="*.ts" --include="*.tsx" apps/ packages/ services/ | grep -v node_modules`

Expected remaining hits (all intentional, per the additive-migration design):
- `infra/local-dev/docker/modules/database-postgres/migrations/0007_announcements.sql` and `init-scripts/07-announcements.sql` — the original column definition, left in place.
- `apps/mobile/src/data/powersync/schema.ts` — `store_hint: column.text` in the `Table` def and `store_hint: string | null` in `AnnouncementRow` (Task 5, kept intentionally).

Any other hit means a spot was missed — go fix it following the same pattern as the task that touched the sibling file.

- [ ] **Step 2: Full typecheck across all three workspaces**

Run:
```bash
cd apps/mobile && npx tsc --noEmit -p .
cd ../../packages/core && npx tsc --noEmit -p .
cd ../../services/api && npx tsc --noEmit -p .
```
Expected: all three clean.

- [ ] **Step 3: Full test run across all three workspaces**

Run:
```bash
cd apps/mobile && npx jest
cd ../../packages/core && npx vitest run
cd ../../services/api && npx vitest run
```
Expected: all green.

No commit for this task — it's a verification pass. If Step 1 finds a missed spot, fix it in a small follow-up commit (`fix(announcements): update remaining storeHint reference in <file>`).

---

## Self-Review Notes

- **Spec coverage:** migration (Task 2), Zod schema + push body (Task 3), vendored API copy + fan-out + upload allowlist (Task 4 — the upload-proxy allowlist was a gap in the original spec, found by reading `upload.ts` during planning and added here), PowerSync schema (Task 5), `announceRun.ts` (Task 6), compose sheet (Task 7), announcement card (Task 8), expiry chevron (Task 1) — all covered. Cross-check task (Task 9) catches anything missed.
- **No placeholders:** every step has literal code, exact file paths, and runnable commands.
- **Type consistency:** `message?: string` (mobile-facing, `announceRun` opts / `AnnounceRunSheet` state) → `message: column.text` / `message: string | null` (PowerSync) → `message?: string | null` (`fanOut.ts` `AnnouncementRow`) → `message?: string` (`announcementPushBody` input, both the `packages/core` original and the `services/api` vendored copy) — consistent optionality handling (`?? undefined` / `?.trim()`) at each boundary crossing.
- **Prod-migration risk flagged explicitly** in Task 2's final note — this plan cannot run SQL against Supabase itself, so the user must apply migration 0008 before this code path goes live, or writes will fail. Surfaced again at plan handoff time, not just buried in a task.
