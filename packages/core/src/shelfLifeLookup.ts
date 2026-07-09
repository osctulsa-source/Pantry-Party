/**
 * Data-driven shelf-life lookup — the food tier of suggestShelfLifeDays.
 * Pure + total: bad input falls through to null, never throws.
 *
 * Matching precedence (per spec): exact normalized name/alias, then the alias
 * with the most tokens all present in the item name, then single-token hits.
 * Ties break to (a) the later token position in the name — the head noun of an
 * English food name comes last ("orange juice" is a juice) — then (b) the
 * record with fewer aliases (more generic row wins for bare names like
 * "chicken", where whole-bird beats deli-sliced).
 */
import { SHELF_LIFE_DATA, type ShelfLifeRecord } from './shelfLifeData.generated.ts';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface IndexEntry {
  rec: ShelfLifeRecord;
  alias: string;
  tokens: string[];
}

let INDEX: IndexEntry[] | null = null;

function index(): IndexEntry[] {
  if (!INDEX) {
    INDEX = [];
    for (const rec of SHELF_LIFE_DATA) {
      for (const alias of rec.k) {
        const norm = normalize(alias);
        if (norm) INDEX.push({ rec, alias: norm, tokens: norm.split(' ') });
      }
    }
  }
  return INDEX;
}

/** Best matching food record for a free-text item name, or null. */
export function matchFood(name: string): ShelfLifeRecord | null {
  const norm = normalize(name);
  if (!norm) return null;
  const nameTokens = norm.split(' ');
  const tokenPos = new Map<string, number>();
  nameTokens.forEach((t, i) => tokenPos.set(t, i));

  let best: { score: number[]; rec: ShelfLifeRecord } | null = null;
  for (const entry of index()) {
    let lastPos = -1;
    let allPresent = true;
    for (const t of entry.tokens) {
      const pos = tokenPos.get(t);
      if (pos === undefined) {
        allPresent = false;
        break;
      }
      if (pos > lastPos) lastPos = pos;
    }
    if (!allPresent) continue;
    const score = [
      entry.alias === norm ? 1 : 0, // exact beats everything
      entry.tokens.length, //          more matched tokens
      lastPos, //                      later (head-noun) position
      -entry.rec.k.length, //          more generic record
    ];
    if (!best || compareScores(score, best.score) > 0) {
      best = { score, rec: entry.rec };
    }
  }
  return best?.rec ?? null;
}

function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return 0;
}

const FALLBACK_ORDER: Array<keyof Pick<ShelfLifeRecord, 'f' | 'p' | 'z'>> = ['f', 'p', 'z'];
const LOCATION_FIELD: Record<string, 'p' | 'f' | 'z'> = {
  pantry: 'p',
  fridge: 'f',
  freezer: 'z',
};

/**
 * Days for a record at a storage location. Built-in locations use their own
 * duration when present; otherwise (and for custom locations / no location)
 * fall back fridge -> pantry -> freezer.
 */
export function daysForLocation(rec: ShelfLifeRecord, location?: string): number | null {
  const field = location ? LOCATION_FIELD[normalize(location)] : undefined;
  if (field !== undefined && rec[field] !== undefined) return rec[field]!;
  for (const f of FALLBACK_ORDER) {
    if (rec[f] !== undefined) return rec[f]!;
  }
  return null;
}
