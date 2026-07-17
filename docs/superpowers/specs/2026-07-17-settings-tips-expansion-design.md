# Settings & tips expansion — design

**Date:** 2026-07-17
**Status:** Approved by user (conversation), pending spec review

Expand the kitchen tips library and give the settings area a polish pass:
more tips across more categories, a deterministic tip of the day, device-local
favorites, and grouped/iconed settings rows.

## Approach

Tip content and rotation logic live in `@breadbox/core` as pure, tested
data/functions (the existing `tips.ts` pattern). Favorites persist per-user in
AsyncStorage exactly like `useQuickAddConfig` — no sync infra. UI changes stay
in the two screens plus one backward-compatible `ListRow` extension.

Synced (PowerSync) favorites were considered and rejected: schema + sync-rule
work for a low-stakes preference; Quick Add config set the device-local
precedent.

## 1. Tips library expansion

**Where:** `packages/core/src/tips.ts` (+ new `packages/core/src/tips.test.ts`)

Four new categories join the existing five. New `TipCategory` values:
`baking`, `produce`, `freezer`, `safety`.

`TIP_CATEGORY_ORDER`: cookware, ingredients, technique, baking, produce,
storage, freezer, safety, general.

`TIP_CATEGORY_META` labels: Baking, Produce, "Freezer smarts", "Food safety"
(existing five keep their labels).

Every category grows to exactly **8 tips** (72 total; 46 newly written). Voice
matches the existing tips: short, concrete, slightly opinionated, one
scannable paragraph, no emoji. Id prefixes: existing `cw- ig- te- st- ge-`,
new `ba- pr- fz- fs-`.

**New core test (`tips.test.ts`) validates:**
- ids are unique;
- every tip's `category` appears in `TIP_CATEGORY_ORDER`;
- `TIP_CATEGORY_ORDER` and `TIP_CATEGORY_META` cover the same set;
- every category in the order has ≥ 6 tips;
- every tip body is non-empty and ≤ 500 chars.

## 2. Tip of the day

**Where:** `packages/core/src/tips.ts` (function + tests beside the data).

`tipOfTheDay(dateISO: string): Tip` — pure and deterministic. Implementation:
hash the `YYYY-MM-DD` prefix (djb2 or similar simple string hash) modulo
`KITCHEN_TIPS.length`. Tests: same date → same tip; a 30-day window hits
multiple categories and never throws; invalid/odd strings still return a tip
(hash of whatever prefix; no exceptions).

**Surfaces:**
- **TipsScreen:** a featured "Tip of the day" card above the category chips —
  accent-soft background, lightbulb icon, caption "TIP OF THE DAY", full tip
  body. Uses today's device date (`new Date().toISOString()`).
- **SettingsScreen:** the "Kitchen tips" `ListRow` is replaced by a compact
  teaser card: caption "Tip of the day", one-line (`numberOfLines={1}`)
  preview of today's tip body, chevron; pressing navigates to `Tips` exactly
  as the old row did.

## 3. Favorites (device-local)

**Where:** new `apps/mobile/src/features/tips/useSavedTips.ts`.

Hook mirroring `useQuickAddConfig`: AsyncStorage key `savedTips:${userId}`
(null userId → empty, no writes), state is `string[]` of tip ids, exposes
`{ savedIds, toggle(id) }`. Corrupt/missing storage falls back to empty.

**UI (TipsScreen):**
- Each tip card gains a bookmark toggle: lucide `Bookmark`, muted outline when
  unsaved, accent + filled when saved; `accessibilityRole="button"`,
  `accessibilityState={{ selected }}`, labels "Save tip" / "Remove from
  saved". Hit target ≥ 44pt via hitSlop.
- A **Saved** chip is pinned at the front of the category chip row (before
  Cookware), always visible. Selecting it lists saved tips across categories.
  Empty state: "Nothing saved yet — tap the bookmark on any tip."

## 4. Polish

**TipsScreen:**
- Per-category lucide icon + brand tone in a small mapping beside the screen
  (`tipArt.ts` — the `stapleArt` pattern: art next to data, separate file).
  Suggested mapping: cookware `CookingPot`, ingredients `Carrot`, technique
  `ChefHat`, baking `Croissant`, produce `Apple`, storage `Archive`, freezer
  `Snowflake`, safety `ShieldCheck`, general `Lightbulb`; tones drawn from the
  existing brand tone palette per category.
- Tip cards: icon chip tinted with the category tone (soft background, toned
  icon) instead of the uniform accent lightbulb; bookmark on the right.
- Category chips stay text-only (restrained); no other chip-row changes.

**SettingsScreen:**
- `ListRow` (in `apps/mobile/src/components/ui.tsx`) gains an optional
  `icon?: ReactNode` leading slot, rendered before the label; omitted = today's
  exact layout (backward-compatible; other callers unaffected).
- The flat row list becomes two captioned groups:
  - **Explore:** Your impact, Collections, Cookbook, History
  - **Manage:** Your stores, Review expiry dates, Household
- Each row gets a small muted lucide icon (16px, `inkMuted`): Your impact
  `Flame`, Collections `LayoutGrid`, Cookbook `BookOpen`, History `Clock`,
  Your stores `Store`, Review expiry dates `CalendarCheck`, Household `Users`.
- The tips teaser card (section 2) closes the list after Manage.
- Name/Account/Reminder sections, sign-out/delete/build-line footer: untouched.

## 5. Testing

- **Core:** new `tips.test.ts` (library validation + `tipOfTheDay`).
- **Mobile:** existing suites stay green; new `useSavedTips.test.ts` for
  toggle/persist/fallback logic (AsyncStorage jest mocking already in use for
  Quick Add config patterns).
- **On-device QA:** tip of the day matches on Settings teaser and Tips
  featured card; bookmark toggles persist across app restarts; Saved chip
  filter + empty state; grouped settings rows render with icons; dark/light
  and small-phone scroll unaffected.

## Out of scope

- No tip search.
- No synced favorites.
- No i18n of tip content (matches existing static-English stance).
- No changes to other Settings rows' behavior or navigation structure.
