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

## ADR-003 · Sync engine — PowerSync (resolved after Phase 0 spike)
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

## ADR-007 · Production Postgres host: RESOLVED — Supabase managed (+ PowerSync Cloud + Railway)
**Status:** Resolved · **Date:** Phase 0 closure / Phase 1 prep · **Resolved:** 2026-07-02

> **Resolution (2026-07-02).** Production runs on the fully managed path:
> **Supabase** (Postgres + Auth — the same project that already backed app auth,
> with the IPv4 add-on so PowerSync can use the direct replication connection),
> **PowerSync Cloud** (managed sync service; sync rules from
> `infra/local-dev/sync-config.yaml`, client auth = Supabase JWTs via JWKS), and
> **Railway** (hosts `services/api`, reaching Supabase through the session-mode
> Supavisor pooler). See `infra/managed/README.md` for the runbook.
>
> An Azure attempt (VNet-isolated Postgres Flexible Server + Container Apps,
> `infra/azure/`, PR #142) shipped its Phase 1 platform but is **parked**: the
> subscription was offer-constrained (region-restricted Postgres provisioning,
> ACR Tasks blocked, Container Apps capacity walls). The IaC stays in the repo
> and the PR #142 branch stays as a revivable reference — do not merge it as an
> active path. **Auth stays on Supabase** — Entra was considered for the Azure
> path and dropped with it.

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

---

## ADR-008 · Throwaway Express upload-proxy (backend decision still deferred)
**Status:** Superseded by ADR-009 · **Date:** PR #8a · **Superseded:** 2026-07-21

**Context.** PowerSync's `uploadData()` requires a server endpoint to drain local CRUD
writes back to Postgres. PR #7.5 added local-only writes (auto-create-household) and
PR #8b will add more (Add Item UI). Both need *some* write path now, but the production
backend stack (NestJS vs Go vs another) is intentionally deferred per `.cursorrules`
and the still-open ADR-007 (hosting). Building the real backend now would force a
premature lock-in to a framework + deployment model.

**Decision.** Stand up a deliberately minimal Express service under `services/api/`,
with the explicit understanding that it is THROWAWAY:

- Single endpoint: `POST /sync/upload`. No others.
- Auth: JWT validation against Supabase JWKS (same key path PowerSync uses), and the
  upload handler verifies that any user-id-shaped column in the payload (`user_id`,
  `created_by`, `added_by`) matches the JWT's `sub`. This is foundational tenancy
  enforcement, not business logic.
- No business logic, no conflict resolution (that stays client-side in `mergeItems()`).
- Every file in `services/api/` carries a `⚠ TEMPORARY` header pointing back to this ADR.

**Promotion triggers.** Replace with the real backend when ANY are true:

1. We've planned three or more endpoints (the *second* new endpoint is the smell).
2. We're within ~30 days of a production deploy.
3. We need a feature Express + raw `pg` can't deliver cleanly — background jobs,
   pub/sub, schedule-driven work, structured authorization beyond JWT-sub matching.

**Consequences.** `services/api/` will need a full rewrite when promoted (NestJS leans
likely per `.cursorrules`). The *wire protocol* (`{ crud: CrudEntry[] }` POST → 200)
stays stable across the rewrite — only the implementation rots. The header on every
file is the self-enforcing tripwire: an editor opening the file is reminded this is
temporary, and adding a non-upload endpoint immediately violates the scope discipline.

**Update mechanism.** When any promotion trigger fires, open a new ADR (ADR-NNN)
documenting the chosen real backend, link back to ADR-008, and mark this status as
**Superseded**.

---

## ADR-009 · Promote the API to NestJS through an incremental hybrid
**Status:** Accepted · **Date:** 2026-07-21

**Context.** ADR-008 deliberately limited the first Express service to a disposable
PowerSync upload path. Its promotion triggers have fired: the service now owns household
invites, recipe search, recipe-instruction backfill, account deletion, push fan-out, and a
scheduled runner-summary sweep. Replacing every route at once would create avoidable wire
compatibility and regression risk.

**Decision.** The production API is Node.js + TypeScript on NestJS. During migration,
NestJS wraps the existing Express application with `ExpressAdapter`:

- `POST /sync/upload`, `POST /household/invite`, `POST /household/accept`, and
  `POST /recipes/search` remain legacy Express handlers mounted by `src/main.ts`.
- `DELETE /account` and `GET /recipes/:id/instructions` are native NestJS controllers.
- New feature endpoints are NestJS-first. Existing Express routers migrate incrementally
  when touched, while preserving their current HTTP contracts and tests.
- Sentry covers both halves: the Nest global filter handles Nest routes and the Express
  error handler covers legacy routers.

**Consequences.** `services/api` is no longer a throwaway one-endpoint proxy and ADR-008
is superseded. The hybrid has two routing/error-handling styles temporarily, but it avoids
a flag-day rewrite. Express remains a Nest platform dependency and migration host, not an
alternative backend decision.

---

## ADR-010 · PowerSync SQLite client uses the op-sqlite adapter
**Status:** Accepted · **Date:** 2026-07-21

**Context.** Early planning named WatermelonDB as the likely local store, but the shipped
mobile data path uses PowerSync's React Native SDK with its op-sqlite adapter. Keeping both
stories in active documentation causes contributors to design against a database layer that
does not exist in the app.

**Decision.** The mobile local database and sync client are PowerSync on SQLite via
`@powersync/op-sqlite` and `@op-engineering/op-sqlite`. Feature reads and writes target the
local PowerSync database. PowerSync downloads household-scoped rows from Postgres, and the
connector drains local CRUD operations through `services/api`.

**Consequences.** WatermelonDB is not part of the current production architecture. Native
SQLite support requires Expo development builds/prebuild, but application code remains in
the Expo managed/prebuild workflow; no hand-maintained Swift, Objective-C, Java, or Kotlin
feature implementation is permitted.

---

## ADR-011 · Replace LWW pantry quantity with idempotent per-device contributions
**Status:** Proposed — implementation debt · **Date:** 2026-07-21

**Context.** Three different quantity policies have appeared in the repository and must not
be conflated:

1. The required invariant is a per-device contribution model merged with `max`, so replaying
   the same write is idempotent.
2. An older architecture document claimed concurrent quantities were naively summed. That
   is not idempotent and is not an acceptable target.
3. The current `pantry_items` schema stores one `quantity` on one UUID row and resolves
   competing updates through `updated_at` last-write-wins. It therefore does not implement
   the required contribution model and may lose a concurrent quantity change.

**Proposed decision.** Introduce device-scoped quantity contributions with stable operation
identity and max-merge semantics, then derive the displayed item quantity from those
contributions. The production migration must include schema evolution, existing-row
backfill, mixed-client compatibility, upload validation, sync-rule changes, and torture
tests proving replay idempotence, concurrent edits, offline restart, and tombstone behavior.

**Non-decision.** This ADR does not select a final table shape or migration sequence and does
not claim that max-merge is implemented. Until a dedicated migration is accepted and
deployed, documentation and code must describe current quantity conflicts as LWW.
