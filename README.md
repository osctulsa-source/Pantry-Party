# Breadbox

> **Internal codename — not a candidate product name.** The brand (Larder / Crumb / TBD)
> is being workshopped in parallel and is intentionally decoupled from the codebase.
> The app ships under whatever name wins; the code never has to know.

A mobile-first (iOS + Android) pantry tracker. This repo is the **technical kickoff
scaffold** for a small founding team, following a **throwaway-prototype-first** plan:
prove the two existential risks in disposable code *before* committing to the
production architecture.

---

## The two questions Phase 0 must answer

Nothing else gets built until these are answered with real numbers, not opinions:

1. **Can we hit ≥ 90% capture accuracy?** Barcode scanning + receipt OCR are the
   product's front door. KitchenPal's ~33% barcode hit rate is the single biggest
   reason it loses users. If we can't clear 90%, the whole premise wobbles.
   → `spikes/capture-accuracy/`

2. **Can we build offline-first sync that never loses data?** Multi-year data-loss
   bugs are KitchenPal's other fatal flaw. Sync is the deepest architectural bet in
   the app. If we can't prove zero-loss under a torture test, we pick a different engine.
   → `spikes/offline-sync/`

**Throwaway means throwaway.** The spike code exists to produce a number and a
decision. Do not let it leak into `apps/` or `packages/`. The learning is the asset.

---

## Repo layout

```
breadbox/
├── spikes/                 ← Phase 0. Disposable. Delete after decisions are logged.
│   ├── capture-accuracy/   ← barcode cascade + receipt OCR, measured against a test set
│   └── offline-sync/       ← offline-first proof + data-loss torture test
├── packages/
│   └── core/               ← the ONE piece of production thinking seeded early:
│                              the canonical pantry-item schema everything shares
├── apps/
│   └── mobile/             ← Expo app — production foundation skeleton (Phase 1)
│       └── src/theme/      ← themeable token layer; the brand drops in here, once
├── services/
│   └── api/                ← backend skeleton (Phase 1) — stub for now
└── docs/
    ├── DECISIONS.md        ← architecture decision record (ADR) log
    └── ARCHITECTURE.md     ← the walking skeleton + data flow
```

## Phases

| Phase | Weeks | Goal | Exit criteria |
|-------|-------|------|---------------|
| **0 · Spikes** | 1–3 | Kill the two risks | Capture ≥ 90% on a 500-item set; sync passes the torture test |
| **1 · Foundation** | 4–6 | Lock the stack, build the walking skeleton | One item flows capture → pantry → recipe end to end |
| **2 · Features** | 7+ | Capture Engine, then Sync Foundation | First killer feature behind a flag in TestFlight/internal track |

## Getting started (Phase 0)

The spikes are **standalone** npm projects (deliberately not workspaces — they're throwaway):

```bash
# Capture accuracy spike
cd spikes/capture-accuracy
npm install
cp .env.example .env        # add UPCITEMDB_KEY etc. (Open Food Facts needs no key)
npm start                   # runs the harness against testset.sample.json, prints hit rate

# Offline sync torture test
cd spikes/offline-sync
npm install
npm test                    # runs the data-loss torture scenarios, reports pass/fail
```

## The stack (decided; see docs/DECISIONS.md for the why)

- **Mobile:** React Native + Expo (managed workflow unless a native module forces bare)
- **Local store:** SQLite / WatermelonDB (offline-first)
- **Sync engine:** PowerSync **or** Replicache — *decided by the Phase 0 spike*
- **Backend:** Node (NestJS) or Go — pick on team strength; Postgres on RDS
- **Auth:** Auth0 or Clerk (managed; do not roll our own)
- **Capture:** Open Food Facts → UPCitemdb → paid fallback; OCR via Tabscanner/Veryfi
- **Recipes:** Spoonacular · **Nutrition:** USDA FoodData Central (free MVP backbone)

## Principle for a small team: buy over build

Every hour spent on undifferentiated infrastructure (sync plumbing, auth, OCR models)
is an hour not spent on the things users actually notice. Rent the hard infrastructure;
build only the glue that makes us *us* — the capture flow, the Cook This surface, the
restock loop.
