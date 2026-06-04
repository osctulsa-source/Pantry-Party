# @breadbox/api

> ⚠ **TEMPORARY upload-proxy.** Replace with real backend per ADR-008.
> Tracking: [`docs/DECISIONS.md` → ADR-008](../../docs/DECISIONS.md).

Minimal Express service whose only job is to drain PowerSync's local CRUD queue
back to Postgres. Stays disposable until one of ADR-008's promotion triggers
fires (3+ planned endpoints, ~30d to production deploy, or a feature Express +
raw `pg` can't deliver cleanly).

## Scope discipline

This service is allowed exactly one endpoint: `POST /sync/upload`. Adding a
second endpoint is the signal to start the real backend (NestJS leaning per
`.cursorrules`), NOT to extend this one.

Every source file carries a `⚠ TEMPORARY` header pointing back to ADR-008.
If you find yourself wanting to remove the header, you've already drifted from
the deal — promote per the ADR instead.

## Local-dev usage

Comes up as part of the local-dev Docker stack:

```sh
cd infra/local-dev
docker compose -f docker/docker-compose.yaml up -d
# api listens on http://localhost:8090
```

Health check (no auth):
```sh
curl http://localhost:8090/health
```

Manual upload smoke test (with a real Supabase access token in `$TOKEN`):
```sh
curl -X POST http://localhost:8090/sync/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"crud":[]}'
# {"ok":true,"applied":0}
```

## Why this isn't NestJS yet

See [ADR-008](../../docs/DECISIONS.md). The TL;DR: we don't yet know the right
backend stack, hosting target, or feature surface area. Express + 200 lines of
TypeScript is the smallest defensible commitment that unblocks `uploadData()`
in the mobile app without locking us in.
