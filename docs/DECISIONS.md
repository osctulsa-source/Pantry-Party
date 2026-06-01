# Architecture Decision Record (ADR) Log

Append-only. Each decision gets a number, a status, the context, and the consequences.
When a decision is reversed, don't delete it — add a new entry that supersedes it.

---

## ADR-001 · Mobile framework: React Native + Expo
**Status:** Accepted · **Date:** Phase 0 kickoff

**Context.** Small founding team, need iOS + Android parity, want one codebase. Native
gives best performance; parallel native doubles the cost.

**Decision.** React Native + Expo, **managed workflow** to start. Drop to a bare/dev-client
workflow only if a native module (barcode scanner, OCR camera, sync engine) forces it.

**Consequences.** ~30–40% mobile build savings vs parallel native. Risk: native module
friction — *validated in the Phase 0 capture spike before we commit.*

---

## ADR-002 · Offline-first is non-negotiable
**Status:** Accepted · **Date:** Phase 0 kickoff

**Context.** KitchenPal's multi-year data-loss bug is its second fatal flaw (after the
barcode scanner). Reliability is our differentiator, not a nice-to-have.

**Decision.** All reads/writes hit a **local store first** (SQLite / WatermelonDB).
Sync happens in the background. The app is fully functional with no network.

**Consequences.** Higher upfront architectural cost. Forces a sync-conflict policy.
This is the deepest bet in the app — hence the dedicated Phase 0 spike.

---

## ADR-003 · Sync engine — DECISION DEFERRED to Phase 0 spike
**Status:** Accepted — PowerSync (Phase 0 closure) · **Date:** Phase 0 kickoff

**Context.** PowerSync and Replicache both solve offline-first conflict-resolved sync.
The choice is consequential and hard to reverse, so we refuse to decide on vibes.

**Decision.** Build the same minimal offline-first proof against **both**, run the
data-loss torture test (`spikes/offline-sync/`), and decide on evidence. Lock by end of
Phase 0 / start of Phase 1.

**Decision criteria (in priority order):** (1) zero data loss under torture test,
(2) conflict-resolution ergonomics, (3) cost at 50K–200K MAU, (4) RN/Expo integration effort.

**Update · PowerSync evidence (Phase 0 spike).** PowerSync passes the full data-loss
torture test — all 5 scenarios, including concurrent same-item adds (no lost update),
offline-delete tombstone propagation, and 1000 update cycles with periodic restarts (no
drift). Run against a **self-hosted** stack (local Postgres + PowerSync via Docker;
`powersync/`), after Supabase's free-tier direct connection proved IPv6-only and its
pooler rejected logical replication. Reproduce: `cd spikes/offline-sync && npm run test:powersync`.

Notes that will shape the production design:
- PowerSync requires a single text `id` PK (no composite keys) — we synthesize
  `id || ':' || device_id` in the sync rule and fold per-device rows on read.
- Download is automatic (Postgres→SQLite); **upload is our code** — the connector's
  `uploadData()` writes back to Postgres. The conflict policy lives there + in `mergeItems()`.

### Closure (Phase 0 spike complete) · Decision: PowerSync

**Why the original "decide on evidence against both" criterion wasn't fully honored.**
Replicache entered maintenance mode between this ADR being written and the evaluation
being run — Rocicorp open-sourced it, stopped charging, no longer accepts new adopters,
and now recommends migrating to Zero (their newer engine). A 2026 greenfield build
wouldn't pick a sunset engine even if it passed every test, so building a Replicache
adapter to "close the comparison" would have been theatre, not evidence. Zero was
considered as a successor but its production track record is too thin (~2024) for a
torture-test pass to meaningfully de-risk a multi-year engine bet.

**Why PowerSync's standalone evidence is sufficient.**
- Full torture-test pass (6/6 against the SyncEngine interface — see commits d3981e8
  and 23ab900): offline writes survive reconnect; cold restart loses nothing;
  concurrent same-item adds accumulate (no lost update); offline-delete tombstones
  propagate; 1000 update cycles with periodic restarts produce no drift.
- The torture test covers correctness — the dimension hardest to recover from in
  production. The remaining dimensions (cost trajectory at 50K–200K MAU, RN/Expo
  ergonomics, vendor stability) require real Phase 1 usage to evaluate, not another
  spike run.

**Open issue carried into Phase 1.** Supabase's IPv6-only direct Postgres endpoint
isn't reachable from PowerSync Cloud's egress, which is why the spike went
self-hosted. The production app must decide: pay for Supabase's IPv4 add-on, host
Postgres elsewhere (Neon, AWS RDS, etc.), or stay self-hosted on PowerSync. This is
a Phase 1 architecture call, not blocking the engine decision.

**Spike cleanup is deferred to Phase 1 kickoff** (not done at closure). The local
Docker stack in `powersync/` is actively useful as a Phase 1 dev environment, and
the adapter in `spikes/offline-sync/` documents the working merge model. Both get
cleaned up — or the Docker stack promoted to `infra/local-dev/` — as part of
Phase 1's first sprint.

---

## ADR-004 · Canonical pantry-item schema seeded early
**Status:** Accepted · **Date:** Phase 0 kickoff

**Context.** Capture (barcode/OCR/manual), sync, recipes, and shopping all read/write
the same entity. Divergent shapes would be expensive to reconcile later.

**Decision.** Define one canonical `PantryItem` schema in `packages/core` now, even before
the production app exists. Both spikes and the real app import it.

**Consequences.** A little upfront discipline; large downstream savings. See
`packages/core/src/schema.ts`.

---

## ADR-005 · Buy over build for undifferentiated infrastructure
**Status:** Accepted · **Date:** Phase 0 kickoff

**Context.** Small team. Every hour on sync plumbing / auth / OCR models is an hour not
spent on the differentiating product.

**Decision.** Rent: sync engine (PowerSync/Replicache), auth (Auth0/Clerk), OCR
(Tabscanner/Veryfi), recipes (Spoonacular), barcode data (Open Food Facts + UPCitemdb +
paid fallback). Build: the capture flow, the Cook This surface, the restock loop, the
canonical schema, the sync-conflict policy.

---

## ADR-006 · Brand decoupled from codebase
**Status:** Accepted · **Date:** Phase 0 kickoff

**Context.** Name + theme are being workshopped over the coming months. Engineering can't
wait for them and shouldn't have to.

**Decision.** Build under codename **Breadbox**. All brand-specific values (palette, type,
logo, app name, bundle ID display name) live behind a **themeable token layer**
(`apps/mobile/src/theme/tokens.ts`). The final brand drops in there with no feature rework.

**Consequences.** One indirection layer. In return, the naming decision never blocks a
single sprint.

---

## ADR-007 · Production Postgres host: DEFERRED
**Status:** Deferred · **Date:** Phase 0 closure / Phase 1 prep

**Context.** Phase 1 development runs against the local PowerSync + Postgres Docker stack
at `infra/local-dev/`. That stack costs nothing to operate and exercises the same
architecture pattern (offline-first sync, logical replication, per-household partitioning)
as any production hosting choice would.

**Decision.** Defer the production hosting choice until we're ready to deploy or invite
external users. Realistic options when we revisit:
- **Supabase + IPv4 add-on (~$29/mo)** — bundled auth + storage + edge functions;
  familiar; the IPv4 add-on resolves the IPv6-only direct endpoint limitation that drove
  the spike to self-hosted in the first place.
- **Neon** — serverless Postgres only; branching is appealing; needs separate auth + storage.
- **AWS RDS** — maximum control; best for an existing AWS-native org.
- **Stay self-hosted on PowerSync at production scale** — viable if the team accepts the
  ops burden; the local-dev stack already proves the architecture.

**Revisit trigger.** First of: (a) any deploy to a host beyond developer machines,
(b) inviting external users to test, (c) Phase 1 exit + V1 launch planning.

**Why deferred is safe.** Postgres is portable; the hosting decision is a deploy-time
concern, not a development-time one. Building against `infra/local-dev/` keeps the Phase 1
walking skeleton work moving without committing to monthly infrastructure costs prematurely.
