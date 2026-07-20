# Announce Custom Message + Expiry Tap Affordance — Design

## Context

Two independent bug reports on the live app:

1. **No way to control the household notification message.** When a user starts a shopping run ("I'm going to the store"), the push notification and in-app card use a fully hardcoded template: `"${sender} is heading to the store"` / `"Shopping run${storeHint}. Add anything you need to the list."` The only customizable input today is an 80-character `store_hint` field, which is just a store name, not a real message.

2. **Users don't know the "food expiring" card is tappable.** On the Pantry screen, the "Use soon" (warning) and "Expired" `StatusCard` headers already navigate to `ExpiringSoonScreen` on tap (`onHeaderPress` wired to `navigation.navigate('ExpiringSoon')`), and the accessibility label correctly says "— view all". But visually there's no cue: no chevron, no button, nothing. Only screen-reader users get the hint. Sighted users have no way to know the row does anything.

These are unrelated, independently shippable fixes. Bundling them in one plan only because they were reported together in the same conversation.

## Fix 1: Custom shopping-run message

### Scope

Replace the `store_hint` field with a free-text `message` field end-to-end. `store_hint` becomes dead (unused) rather than dropped, since the `announcements` table is live in prod Supabase and this is additive-only for safety.

### Data model

**New Postgres migration** `infra/local-dev/docker/modules/database-postgres/migrations/0008_announcement_message.sql`:
```sql
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS message TEXT;
```
Idempotent, matches the existing migration style (no CHECK constraints — zod owns validation client-side, per migration 0007's documented philosophy). `store_hint` column stays in the table, unused by new code, so no data loss and no risk to in-flight rows during rollout.

Mirror the same `ALTER TABLE` in `infra/local-dev/docker/modules/database-postgres/init-scripts/07-announcements.sql` so fresh local volumes match prod after migration.

**PowerSync**: add `message` to the `announcements` table definition in `apps/mobile/src/data/powersync/schema.ts` (additive column, same pattern as existing fields). Sync rules (`infra/local-dev/sync-config.yaml:78-82`) already select `SELECT * FROM announcements ...`, so no sync-rules change is needed — the new column syncs automatically once it exists in Postgres and the PowerSync schema.

**Zod schema** `packages/core/src/announcements.ts`:
- Add `message: z.string().max(120).optional()` to the `Announcement` object, alongside (not replacing) `storeHint` — the field stays in the type since old rows may still have it, but new code never writes it.
- `announcementPushBody`'s input type gains `message?: string`.

### Push body logic

`packages/core/src/announcements.ts` `announcementPushBody` (and its vendored mirror `services/api/src/push/announcementsCore.ts`, per that file's existing "KEEP IN SYNC" contract):

```ts
if (a.kind === "shopping_run") {
  return {
    title: `${senderName} is heading to the store`,
    body: a.message?.trim() ? a.message.trim() : "Add anything you need to the list.",
  };
}
```

Title is unchanged (always useful — who, doing what). Body is the user's message verbatim when present, otherwise the existing default copy minus the now-gone store-hint clause ("Shopping run. Add anything you need to the list." → simplified to "Add anything you need to the list." since "Shopping run" was redundant with the title).

### `announceRun.ts` (mobile)

`apps/mobile/src/features/announcements/announceRun.ts`: `opts.storeHint?: string` → `opts.message?: string`; INSERT statement writes `message` instead of `store_hint` (column list changes; `store_hint` omitted going forward — remains NULL for new rows, which is fine since nothing reads it anymore).

### `AnnounceRunSheet.tsx` (mobile)

Swap the existing `TextInput` (currently `placeholder="Store (optional) — e.g., Kroger"`, `maxLength={80}`) for:
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
(`autoCorrect` flips to `true` — free text benefits from it, unlike a store name.) State renamed `storeHint` → `message`; `onSubmit` passes `message: message.trim() || undefined` into `announceRun()`.

### `AnnouncementCard.tsx` (mobile)

The `meta()` function currently builds: `Heads out around 5:30 · Kroger` (time + store hint). New version appends the message instead of the store hint:
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
Accessibility label (line 70) drops the `store_hint` interpolation; the `meta()` text already covers it visually and the label just needs "Shopping run" (unchanged for the non-run case).

### Type plumbing

`useActiveAnnouncements.ts` queries `SELECT * FROM announcements ...` and types the result as `AnnouncementRow` (from `apps/mobile/src/data/powersync/schema.ts`), so no query changes are needed — adding `message` to the `AnnouncementRow` type/table definition in `schema.ts` (the same PowerSync schema edit from the "PowerSync" section above) is sufficient for it to flow through to `AnnouncementCard.tsx` automatically.

## Fix 2: Expiry card tap affordance

### Scope

`apps/mobile/src/features/pantry/PantryScreen.tsx`, `StatusCard` component (~line 770-839).

### Change

Currently the chevron only renders when `collapsible` (`onToggle !== undefined`) is true:
```tsx
{collapsible &&
  (collapsed ? (
    <ChevronRight size={16} color={accent} accessibilityLabel="Expand" />
  ) : (
    <ChevronDown size={16} color={accent} accessibilityLabel="Collapse" />
  ))}
```

New logic: show a chevron whenever the row is pressable at all (`headerPress` truthy), not just when collapsible. For the non-collapsible, `onHeaderPress`-only case (expired/warning cards), always show `ChevronRight` (there's nothing to expand/collapse — it's a one-way navigation, so no toggle state, always pointing right as "go here"):

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

No other changes — the `Pressable`, `onPress`, `disabled`, and accessibility label logic on the header row are already correct.

## Out of scope

- No changes to `activeRunId`, `isRunnerSummaryDue`, `runnerSummaryBody`, or the reaction system.
- No changes to `ExpiringSoonScreen.tsx` itself (the destination screen already has full per-item actions).
- Not dropping the `store_hint` column or backfilling `message` from old `store_hint` values — out of scope, low value (old announcements are ephemeral/expired by the time this ships).
- Not adding a `message` field to the "cooking" announcement kind — bug report was specifically about shopping runs.

## Testing

- `packages/core/src/announcements.test.ts`: extend/update `announcementPushBody` tests for the new message-based body (with and without a message).
- `services/api/src/push/fanOut.test.ts`: check whether it exercises `announcementPushBody` directly or via a fixture referencing `storeHint` — update accordingly.
- No new component tests planned for `AnnounceRunSheet`/`AnnouncementCard`/`StatusCard` (no existing test files for these; matches current coverage level in this codebase — manual QA per usual for this app's UI layer).
