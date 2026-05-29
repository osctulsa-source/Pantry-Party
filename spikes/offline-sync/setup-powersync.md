# Setup · PowerSync against the offline-sync spike

Goal: get `ENGINE=powersync npm test` to print **7 passed · 0 failed**. When it does,
PowerSync is a viable candidate for ADR-003.

**Realistic effort:** 1–2 focused days end-to-end. Most of that is infrastructure setup,
not code — the adapter itself is small.

## What you're building

```
┌─────────────────┐   per-device rows   ┌─────────────────┐   continuous sync   ┌─────────────────┐
│  Local SQLite   │ ◀─────────────────▶ │   PowerSync     │ ◀─────────────────▶ │   Supabase      │
│  (one per node) │                     │   Cloud (dev)   │                     │   (Postgres)    │
└─────────────────┘                     └─────────────────┘                     └─────────────────┘
       ▲                                                                                ▲
       │ powerSyncEngine.ts                                                             │ schema:
       │ writes its own contribution                                                    │ pantry_items(id, device_id, ...)
       │ reads all + folds via mergeItems()                                             │ PRIMARY KEY (id, device_id)
```

## 1. Postgres (Supabase free tier, ~10 min)

1. **supabase.com** → New project. Save the password somewhere.
2. Project → **SQL Editor** → run:
   ```sql
   CREATE TABLE pantry_items (
     id          TEXT    NOT NULL,
     device_id   TEXT    NOT NULL,
     name        TEXT    NOT NULL DEFAULT '',
     qty         REAL    NOT NULL DEFAULT 0,
     expires_at  TEXT,            -- ISO 8601
     deleted     INTEGER NOT NULL DEFAULT 0,
     updated_at  BIGINT  NOT NULL,
     PRIMARY KEY (id, device_id)
   );
   ```
3. Project → **Settings → Database** → grab the **connection string** (URI form).
   You'll paste this into PowerSync next.

## 2. PowerSync Cloud (dev instance, ~15 min)

1. **powersync.com** → sign up → create a new instance (Free tier).
2. Add **Postgres connection** → paste the Supabase URI from step 1.
3. Define **Sync Rules** — stream every row of pantry_items to every connected client:
   ```yaml
   bucket_definitions:
     global:
       data:
         - SELECT * FROM pantry_items
   ```
   (Per-household partitioning will come in Phase 1; the spike just needs round-trip.)
4. From the PowerSync dashboard, copy:
   - **PowerSync URL** (looks like `https://xxxxxxxxxxxxxxxx.powersync.journeyapps.com`)
   - **Development token** (or generate one — used as the bearer for the spike)

## 3. Local install + env

```bash
cd spikes/offline-sync
npm install @powersync/node @powersync/common
cp .env.example .env
```

Edit `.env`:
```
POWERSYNC_URL=https://...
POWERSYNC_TOKEN=eyJ...
```

## 4. Fill in the adapter

Open `src/powerSyncEngine.ts` and work through the TODOs in this order:

1. **Constructor** — instantiate `PowerSyncDatabase` against a local SQLite file
   (`.powersync/<device>.db` — different file per simulated device so S3 and S4 work).
2. **`setOnline()`** — call `db.connect({ /* connector with URL + token */ })` /
   `db.disconnect()`. This is what makes "offline writes survive reconnect" testable.
3. **`add()` / `del()`** — the `INSERT ... ON CONFLICT (id, device_id) DO UPDATE` SQL
   in the file's comments is the right shape; MAX/MIN on the right columns gives you
   idempotency for free.
4. **`read()`** — fetch all rows, hand them to `foldRows()` (already written; uses our
   canonical `mergeItems()` so the merge logic stays in ONE place across engines).
5. **`sync()`** — settle the queue. `db.waitForFirstSync()` works for the simple case;
   for repeated waits use the `SyncStatus` observable until `dataFlowStatus.uploading`
   and `dataFlowStatus.downloading` both go false. The PowerSync docs have an example
   under "Sync Status".
6. **`restart()`** — `await db.close()`, then `new PowerSyncDatabase(...)` against the
   SAME `dbFilename`. State on disk has to survive — that's S2.

## 5. Run

```bash
ENGINE=powersync npm test
```

Goal: same `7 passed · 0 failed` as the memory engine. When it lands, you've proven
PowerSync handles every data-loss class we care about — go log ADR-003.

## When it fails (it will, the first time)

- **S1 fails (offline writes don't reappear after reconnect):** PowerSync's queue isn't
  flushing. Confirm `db.connect()` is actually being called, and that `sync()` is
  waiting on the right signal (not returning immediately).
- **S3 fails (concurrent adds collapse to 1):** something is overwriting per-device
  rows. Either the `device_id` isn't being included in the row, or your SQL is `INSERT
  OR REPLACE` instead of `ON CONFLICT (id, device_id) DO UPDATE`. The composite PK is
  load-bearing.
- **S4 fails (offline device doesn't honor delete):** tombstone row isn't propagating.
  Verify the delete writes a row (`deleted=1`) rather than issuing a DELETE statement.
- **S5 fails (qty drifts from 1):** the `MAX(qty, excluded.qty)` is missing —
  re-applying the same write must not increment.

When all 5 pass, this whole directory gets deleted. The engine choice survives as an
ADR in `docs/DECISIONS.md`; the code does not.
