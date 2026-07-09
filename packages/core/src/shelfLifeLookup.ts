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
 *   5. record name ascending (deterministic across same-score records with
 *      different names, e.g. "citrus fruit" beats "orange juice" for bare
 *      "orange")
 *   6. earlier dataset order wins — FoodKeeper's editorial order lists the
 *      canonical variant of a food first (bare "eggs" is the in-shell row,
 *      not raw whites/yolks), and the committed CSV + deterministic generator
 *      make the order stable across runs
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

interface Score {
  exact: number;
  nameCovered: number;
  matchedTokens: number;
  lastPos: number;
  /** Normalized record name; ascending tie-break. */
  name: string;
}

/**
 * True when `a` strictly beats `b` per the documented precedence. Equal scores
 * return false, so the earlier dataset entry (the incumbent during the scan)
 * wins the final tie — FoodKeeper lists the canonical variant first.
 */
function beats(a: Score, b: Score): boolean {
  if (a.exact !== b.exact) return a.exact > b.exact;
  if (a.nameCovered !== b.nameCovered) return a.nameCovered > b.nameCovered;
  if (a.matchedTokens !== b.matchedTokens) return a.matchedTokens > b.matchedTokens;
  if (a.lastPos !== b.lastPos) return a.lastPos > b.lastPos;
  if (a.name !== b.name) return a.name < b.name;
  return false;
}

/** Best matching food record for a free-text item name, or null. */
export function matchFood(name: string): ShelfLifeRecord | null {
  const norm = normalize(name);
  if (!norm) return null;
  const nameTokens = norm.split(' ');

  let best: { score: Score; entry: IndexEntry } | null = null;
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

    const score: Score = {
      exact,
      nameCovered: entry.nameTokens.every((t) => nameTokens.some((nt) => tokensEqual(nt, t)))
        ? 1
        : 0,
      matchedTokens: matched.size,
      lastPos: Math.max(...matched),
      name: entry.normName,
    };
    if (!best || beats(score, best.score)) {
      best = { score, entry };
    }
  }
  return best?.entry.rec ?? null;
}

type LocationField = 'p' | 'f' | 'z';

/**
 * Fields to try, in order, per storage mode. Direction-aware: a substitute
 * duration is only used when it is conservative (a shorter-storage-mode
 * number), never the reverse — the freezer-only milk record (z: 91) must not
 * answer a fridge request with "91 days". No entry -> null, which defers to
 * the caller's category tier for a sane default.
 */
const FIELD_ORDER: Record<string, readonly LocationField[]> = {
  pantry: ['p'],
  fridge: ['f', 'p'],
  freezer: ['z'],
};
/** Custom/unknown/no location: no declared storage mode to contradict. */
const DEFAULT_ORDER: readonly LocationField[] = ['f', 'p', 'z'];

/**
 * Days for a record at a storage location. Built-in locations use their own
 * duration when present, falling back only in the conservative direction
 * (fridge may borrow the pantry number; pantry and freezer never borrow) and
 * returning null otherwise so the category tier can answer instead. Custom or
 * missing locations fall back fridge -> pantry -> freezer.
 */
export function daysForLocation(rec: ShelfLifeRecord, location?: string): number | null {
  const order = (location && FIELD_ORDER[normalize(location)]) || DEFAULT_ORDER;
  for (const f of order) {
    if (rec[f] !== undefined) return rec[f]!;
  }
  return null;
}
