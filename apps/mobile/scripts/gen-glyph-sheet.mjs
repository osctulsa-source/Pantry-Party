/**
 * gen-glyph-sheet — regenerate the visual QA sheet for the loaf-mark glyph
 * family. Extracts every glyph's SVG straight from brandGlyphs.*.tsx and
 * resolves its paints per FOOD_TONE / PANTRY_TONE, so the sheet always
 * reflects the committed code (no hand-copied markup to drift).
 *
 *   node apps/mobile/scripts/gen-glyph-sheet.mjs [out.html]
 *
 * Default output: apps/mobile/scripts/glyph-sheet.html (gitignored).
 * See ../src/components/BRAND-GLYPHS.md for the authoring rules.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rd = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const core = rd('../src/components/brandGlyphs.core.tsx');
const pantry = rd('../src/components/brandGlyphs.pantry.tsx');

// --- palette (brandPalette.ts) ---
const GROUNDS = {
  terracotta: '#C16A3B', brick: '#B54B3B', ochre: '#BF8B2E', cocoa: '#855637',
  olive: '#77814B', fern: '#4E7A45', spruce: '#3F736C', blue: '#4C6B84', plum: '#7C5568',
};
const CREAM = '#F2EDE1';
const LEAF = '#2C5C39';

// --- tone maps (kept in sync with BrandIcon.FOOD_TONE + PANTRY_TONE) ---
const CORE_TONE = {
  bread: 'terracotta', carrot: 'terracotta', tomato: 'brick', apple: 'brick',
  lemon: 'ochre', cheese: 'ochre', mushroom: 'cocoa', herb: 'cocoa', spoon: 'cocoa',
  pear: 'olive', croissant: 'olive', pepper: 'fern', fish: 'spruce', bottle: 'spruce',
  egg: 'blue', jar: 'blue', grapes: 'plum', cherry: 'plum',
};
// PANTRY_TONE is parsed from source below so it can't drift.
function parseToneMap(src) {
  const block = src.slice(src.indexOf('PANTRY_TONE'));
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('}'));
  const map = {};
  for (const m of body.matchAll(/(\w+):\s*'(\w+)'/g)) map[m[1]] = m[2];
  return map;
}
const TONE = { ...CORE_TONE, ...parseToneMap(pantry) };

function extract(src) {
  const re = /(\w+):\s*\(\{[^}]*\}\)\s*=>\s*\(\s*<>([\s\S]*?)<\/>\s*\),/g;
  const out = {};
  let m;
  while ((m = re.exec(src)) !== null) out[m[1]] = m[2];
  return out;
}
const glyphs = { ...extract(core), ...extract(pantry) };

/** JSX (react-native-svg) -> plain inline SVG, paints resolved for one ground. */
function toSvg(jsx, ground) {
  const s = jsx
    .replace(/=\{(-?[\d.]+)\}/g, '="$1"')
    .replace(/\{body\}/g, `"${CREAM}"`)
    .replace(/\{cut\}/g, `"${GROUNDS[ground]}"`)
    .replace(/\{leaf\}/g, `"${LEAF}"`)
    .replace(/<Path/g, '<path').replace(/<Circle/g, '<circle')
    .replace(/<Ellipse/g, '<ellipse').replace(/<Rect/g, '<rect');
  return `<svg viewBox="0 0 48 48" class="gl" aria-hidden="true"><g stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${s}</g></svg>`;
}

const GROUPS = [
  ['Core food family', 'The original 18 — fruit, veg, protein, and the generic jar/bottle/spoon fallbacks.',
    ['bread','tomato','pear','lemon','fish','grapes','egg','pepper','mushroom','apple','croissant','cheese','bottle','jar','cherry','carrot','herb','spoon']],
  ['Baking staples', 'Dry goods and leaveners.',
    ['floursack','sugarbowl','sugarbag','sodabox','powdertin','saltshaker','yeastpacket']],
  ['Oils & sauces', 'Bottles, jars, and squeeze containers — the shape carries the identity.',
    ['oliveoilbottle','oiljug','soybottle','ketchupbottle','mustardbottle','mayojar','hotsaucebottle','vinegarflask','honeypot']],
  ['Grains & canned', 'Pantry basics.',
    ['ricebowl','spaghetti','oatcanister','tomatocan','beancan','stockcarton','peppergrinder']],
  ['Drinks', 'Staged ahead of the lazy-kitchen work, now shipped.',
    ['waterglass','fizzybottle','juicecarton','coffeemug','teacup','sodacan']],
  ['Fridge basics', 'Cold staples.', ['milkjug','butterdish']],
  ['Allergen marks', 'Used by the diet & allergy onboarding tiles.', ['wheat','peanut','shrimp']],
  ['Cooking devices', 'The appliance family — no leaf, ever.',
    ['stove','oven','crockpot','airfryer','grill','griddle','instantpot','sheetpan','microwave','nocook']],
];

const tile = (name) => {
  const tone = TONE[name];
  return `<figure class="tile"><div class="panel" style="--ground:${GROUNDS[tone]}">${toSvg(glyphs[name], tone)}</div>` +
    `<figcaption><span class="nm">${name}</span><span class="tn">${tone}</span></figcaption></figure>`;
};
const swatches = Object.entries(GROUNDS)
  .map(([n, hex]) => `<div class="sw"><span class="chip" style="background:${hex}"></span><span class="sw-n">${n}</span><span class="sw-h">${hex}</span></div>`)
  .join('');
const constants =
  `<div class="sw"><span class="chip" style="background:${CREAM}"></span><span class="sw-n">cream <em>silhouette</em></span><span class="sw-h">${CREAM}</span></div>` +
  `<div class="sw"><span class="chip" style="background:${LEAF}"></span><span class="sw-n">leaf <em>accent</em></span><span class="sw-h">${LEAF}</span></div>`;

const sections = GROUPS.map(([title, sub, names]) => {
  const missing = names.filter((n) => !glyphs[n]);
  if (missing.length) throw new Error(`Missing glyphs: ${missing.join(', ')}`);
  return `<section class="grp"><header class="grp-h"><h2>${title}</h2><p>${sub}</p><span class="ct">${names.length}</span></header>` +
    `<div class="grid">${names.map(tile).join('')}</div></section>`;
}).join('\n');

const total = Object.keys(glyphs).length;
const page = `<title>Loaf-mark glyph family</title>
<style>
:root{ --paper:#F4EEE2; --card:#FBF7EF; --ink:#2C2620; --muted:#877E6F; --hair:#E2D9C7; --leaf:#3C6B45; --shadow:rgba(60,45,25,.10); }
@media (prefers-color-scheme:dark){ :root{ --paper:#1C1815; --card:#26211C; --ink:#F1EADC; --muted:#A99E8B; --hair:#3A332B; --leaf:#8FBF87; --shadow:rgba(0,0,0,.35); } }
:root[data-theme="light"]{ --paper:#F4EEE2; --card:#FBF7EF; --ink:#2C2620; --muted:#877E6F; --hair:#E2D9C7; --leaf:#3C6B45; --shadow:rgba(60,45,25,.10); }
:root[data-theme="dark"]{ --paper:#1C1815; --card:#26211C; --ink:#F1EADC; --muted:#A99E8B; --hair:#3A332B; --leaf:#8FBF87; --shadow:rgba(0,0,0,.35); }
*{box-sizing:border-box} body{margin:0;background:var(--paper);color:var(--ink);font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased;}
.wrap{max-width:1080px;margin:0 auto;padding:clamp(28px,5vw,64px) clamp(18px,4vw,40px) 96px;}
.top{display:flex;flex-direction:column;gap:16px;border-bottom:1px solid var(--hair);padding-bottom:30px;}
.eyebrow{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--leaf);font-weight:700;}
h1{font-size:clamp(30px,5vw,46px);line-height:1.04;margin:0;letter-spacing:-.02em;font-weight:800;max-width:16ch;text-wrap:balance;}
.lede{margin:0;max-width:60ch;color:var(--muted);font-size:clamp(15px,2vw,17px);}
.stats{display:flex;flex-wrap:wrap;gap:28px;margin-top:4px;} .stat{display:flex;flex-direction:column;} .stat b{font-size:26px;font-weight:800;} .stat span{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);}
.palette{margin:34px 0 10px;} .palette h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 14px;font-weight:700;}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}
.sw{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--hair);border-radius:12px;padding:8px 10px;}
.chip{width:26px;height:26px;border-radius:7px;flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);}
.sw-n{font-size:13px;font-weight:600;flex:1;text-transform:capitalize;} .sw-n em{font-style:normal;color:var(--muted);font-weight:400;} .sw-h{font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums;}
.grp{margin-top:40px;} .grp-h{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;border-bottom:1px solid var(--hair);padding-bottom:12px;margin-bottom:22px;}
.grp-h h2{font-size:20px;margin:0;font-weight:750;} .grp-h p{margin:0;color:var(--muted);font-size:14px;flex:1;min-width:200px;}
.ct{font-size:12px;font-weight:700;color:var(--leaf);background:color-mix(in srgb,var(--leaf) 14%,transparent);border-radius:999px;padding:2px 10px;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:clamp(12px,2vw,18px);}
.tile{margin:0;display:flex;flex-direction:column;gap:9px;}
.panel{aspect-ratio:1;background:var(--ground);border-radius:18px;display:grid;place-items:center;box-shadow:0 2px 10px var(--shadow),inset 0 0 0 1px rgba(255,255,255,.06);}
.gl{width:66%;height:66%;display:block;}
figcaption{display:flex;flex-direction:column;gap:1px;padding-left:2px;}
.nm{font-size:12.5px;font-weight:600;font-family:ui-monospace,Consolas,monospace;} .tn{font-size:11px;color:var(--muted);text-transform:capitalize;}
</style>
<div class="wrap">
  <header class="top">
    <span class="eyebrow">Pantry Party · brand illustration system</span>
    <h1>The loaf-mark glyph family</h1>
    <p class="lede">Every food, staple, and appliance drawn to one rule — a solid cream silhouette with a single green leaf, set on one of nine muted earthy grounds. Rendered on their live picker tiles, exactly as they ship.</p>
    <div class="stats"><div class="stat"><b>${total}</b><span>glyphs</span></div><div class="stat"><b>${Object.keys(GROUNDS).length}</b><span>grounds</span></div><div class="stat"><b>2</b><span>constants</span></div><div class="stat"><b>${GROUPS.length}</b><span>collections</span></div></div>
  </header>
  <section class="palette"><h2>Grounds</h2><div class="swatches">${swatches}</div><h2 style="margin-top:22px">Constants — same in light &amp; dark</h2><div class="swatches">${constants}</div></section>
  ${sections}
</div>`;

const out = process.argv[2]
  ? fileURLToPath(new URL(process.argv[2], `file://${process.cwd()}/`))
  : fileURLToPath(new URL('./glyph-sheet.html', import.meta.url));
writeFileSync(out, page);
console.log(`rendered ${total} glyphs across ${GROUPS.length} groups -> ${out}`);
