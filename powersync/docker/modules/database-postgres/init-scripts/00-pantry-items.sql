-- offline-sync spike · source-of-truth table for PowerSync replication.
-- Each device writes its OWN row (composite PK id + device_id); the cross-device
-- merge happens client-side in mergeItems(). Schema mirrors RawRow in
-- spikes/offline-sync/src/powerSyncEngine.ts and setup-powersync.md.
--
-- Runs only on first start (empty data volume). Ordered 00- so the table exists
-- before 01-powersync-publication.sql creates the `powersync` publication.

CREATE TABLE IF NOT EXISTS pantry_items (
  id          TEXT    NOT NULL,
  device_id   TEXT    NOT NULL,
  name        TEXT    NOT NULL DEFAULT '',
  qty         REAL    NOT NULL DEFAULT 0,
  expires_at  TEXT,            -- ISO 8601, nullable
  deleted     INTEGER NOT NULL DEFAULT 0,
  updated_at  BIGINT  NOT NULL,
  PRIMARY KEY (id, device_id)
);

-- Composite PK is the default REPLICA IDENTITY, which is what logical replication
-- needs to stream UPDATEs (our tombstones are UPDATEs to deleted=1, not DELETEs).
