# @breadbox/mobile

The Expo app. **A skeleton, not an app** — it fills in during Phase 1 once the spikes
have de-risked the architecture. Don't build features here until Phase 0 decisions are logged.

## Phase 1 — the walking skeleton

Goal: one item travels capture → local store → sync → recipe match, end to end. See
`../../docs/ARCHITECTURE.md` for the checklist that defines "done."

Build order:
1. Wire the chosen sync engine (ADR-003 winner) + WatermelonDB local store.
2. `src/features/capture` — barcode scan → `PantryItem` (validate with `@breadbox/core`).
3. `src/features/pantry` — list view reading local state.
4. `src/features/cook` — Spoonacular `findByIngredients` against current pantry.
5. Prove the whole slice runs in CI against a simulator.

## Conventions

- **Theme:** import from `src/theme/tokens.ts`. Never hardcode a color or font (ADR-006).
- **Schema:** import `PantryItem` from `@breadbox/core`. One shape, everywhere (ADR-004).
- **Workflow:** Expo managed until a native module forces a dev client. The barcode scanner
  and camera/OCR path are the likely forcing function — confirm during the capture spike.
