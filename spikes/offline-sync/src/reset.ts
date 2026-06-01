/**
 * Phase 0 — offline-sync spike · PowerSync test reset (runs before test:powersync)
 *
 * PowerSync's backing Postgres and each device's local SQLite both PERSIST across
 * runs, but the torture test (esp. S1's exact-count assertion) assumes a clean
 * slate. This truncates the source table and deletes the local SQLite files so
 * `npm run test:powersync` is deterministic and re-runnable.
 *
 * THROWAWAY.
 */
import { rmSync } from "node:fs";
import pg from "pg";

const PG_URL =
  process.env.POWERSYNC_PG_URL ?? "postgresql://postgres:changeme@localhost:5432/postgres";

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: PG_URL });
  try {
    await client.connect();
    await client.query("TRUNCATE pantry_items");
    console.log("reset · truncated pantry_items in Postgres");
  } catch (err) {
    console.error(
      `reset · could not reach Postgres at ${PG_URL.replace(/:[^:@/]*@/, ":***@")} — is the Docker stack up? (powersync docker start)`,
    );
    throw err;
  } finally {
    await client.end().catch(() => {});
  }

  rmSync(".powersync", { recursive: true, force: true });
  console.log("reset · cleared local .powersync SQLite files");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
