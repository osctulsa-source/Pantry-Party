/**
 * Data-driven shelf-life lookup — the food tier of suggestShelfLifeDays.
 * Pure + total: bad input falls through to null, never throws.
 *
 * Matching is scored per RECORD (union of matched tokens across all of its
 * fully-matching aliases), with plural-insensitive token equality
 * (orange == oranges, box == boxes). Precedence, compared lexicographically:
 *   1. exact — record name or any alias equals the whole normalized input
 *   2. nameCovered — every token of the record's own name is present in the
 *      input (the "it really is a bread/milk" signal; ranked above token count
 *      so incidental adjective hits — ham's "fresh"+"whole" on "fresh whole
 *      milk" — cannot outvote the actual food)
 *   3. matchedTokens — size of the record's matched-token union
 *   4. lastPos — later input-token position in the union; the head noun of an
 *      English food name comes last ("orange juice" is a juice)
 *   5. deterministic ties — record name ascending, then more location fields
 *      defined (p/f/z), then dataset order
 */
import { SHELF_LIFE_DATA, type ShelfLifeRecord } from './shelfLifeData.generated.ts';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Plural-insensitive token equality: orange == oranges, box == boxes. */
function tokensEqual(a: string, b: string): boolean {
  return a === b || a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`;
}

interface IndexEntry {
  rec: ShelfLifeRecord;
  normName: string;
  nameTokens: string[];
  aliases: Array<{ alias: string; tokens: string[] }>;
  locationFields: number;
}

let INDEX: IndexEntry[] | null = null;

function index(): IndexEntry[] {
  if (!INDEX) {
    INDEX = [];
    for (const rec of SHELF_LIFE_DATA) {
      const normName = normalize(rec.n);
      const aliases: IndexEntry['aliases'] = [];
      for (const alias of rec.k) {
        const norm = normalize(alias);
        if (norm) aliases.push({ alias: norm, tokens: norm.split(' ') });
      }
      if (aliases.length === 0) continue;
      INDEX.push({
        rec,
        normName,
        nameTokens: normName ? normName.split(' ') : [],
        aliases,
        locationFields:
          (rec.p !== undefined ? 1 : 0) +
          (rec.f !== undefined ? 1 : 0) +
          (rec.z !== undefined ? 1 : 0),
      });
    }
  }
  return INDEX;
}

/** Position of the first input token plural-equal to `token`, or -1. */
function findToken(nameTokens: string[], token: string): number {
  for (let i = 0; i < nameTokens.length; i++) {
    if (tokensEqual(nameTokens[i]!, token)) return i;
  }
  return -1;
}

/** Best matching food record for a free-text item name, or null. */
export function matchFood(name: string): ShelfLifeRecord | null {
  const norm = normalize(name);
  if (!norm) return null;
  const nameTokens = norm.split(' ');

  let best: { score: number[]; tieName: string; entry: IndexEntry } | null = null;
  for (const entry of index()) {
    // Union of matched input-token positions across all fully-matching aliases.
    const matched = new Set<number>();
    let exact = entry.normName === norm ? 1 : 0;
    for (const { alias, tokens } of entry.aliases) {
      if (alias === norm) exact = 1;
      const positions: number[] = [];
      let allPresent = true;
      for (const t of tokens) {
        const pos = findToken(nameTokens, t);
        if (pos === -1) {
          allPresent = false;
          break;
        }
        positions.push(pos);
      }
      if (allPresent) for (const p of positions) matched.add(p);
    }
    if (matched.size === 0) continue;

    const nameCovered = entry.nameTokens.every((t) =>
      nameTokens.some((nt) => tokensEqual(nt, t)),
    )
      ? 1
      : 0;
    const lastPos = Math.max(...matched);
    const score = [exact, nameCovered, matched.size, lastPos, 0, entry.locationFields];
    if (!best || better(score, entry.normName, best.score, best.tieName)) {
      best = { score, tieName: entry.normName, entry };
    }
  }
  return best?.entry.rec ?? null;
}

/** Lexicographic score comparison with the name tie-break (ascending) at slot 4. */
function better(score: number[], name: string, bestScore: number[], bestName: string): boolean {
  for (let i = 0; i < score.length; i++) {
    if (i === 4) {
      if (name !== bestName) return name < bestName;
      continue;
    }
    if (score[i]! !== bestScore[i]!) return score[i]! > bestScore[i]!;
  }
  return false;
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
