/**
 * Kitchen tips and tricks — curated advice for curious cooks.
 *
 * Tip categories map to the app's main surfaces (cookware, ingredients, cooking
 * technique, storage, and general kitchen wisdom). Each tip is a short,
 * scannable paragraph. The data is static (no i18n yet) and consumed by the
 * TipsScreen in the mobile app.
 */

export type TipCategory =
  | 'cookware'
  | 'ingredients'
  | 'technique'
  | 'baking'
  | 'produce'
  | 'storage'
  | 'freezer'
  | 'safety'
  | 'general';

export interface Tip {
  id: string;
  category: TipCategory;
  body: string;
}

export const TIP_CATEGORY_META: Record<TipCategory, { label: string }> = {
  cookware: { label: 'Cookware' },
  ingredients: { label: 'Ingredients' },
  technique: { label: 'Technique' },
  baking: { label: 'Baking' },
  produce: { label: 'Produce' },
  storage: { label: 'Storage' },
  freezer: { label: 'Freezer smarts' },
  safety: { label: 'Food safety' },
  general: { label: 'General' },
};

export const TIP_CATEGORY_ORDER: TipCategory[] = [
  'cookware',
  'ingredients',
  'technique',
  'baking',
  'produce',
  'storage',
  'freezer',
  'safety',
  'general',
];

export const KITCHEN_TIPS: Tip[] = [
  // ── Cookware ───────────────────────────────────────────────────────────
  { id: 'cw-1', category: 'cookware', body: "Don't crowd the pan. When you pile food into a skillet the temperature drops and your ingredients steam instead of sear. Cook in batches — the crust is worth the wait." },
  { id: 'cw-2', category: 'cookware', body: 'Cast iron retains heat better than any other pan. Let it preheat for 5–7 minutes on medium before adding oil, then another 30 seconds before food touches the surface. You will get a restaurant-quality sear every time.' },
  { id: 'cw-3', category: 'cookware', body: 'Nonstick pans have a lifespan. Once the coating shows scratches or food starts clinging, it is done. Replace every 2–3 years and never use metal utensils or cooking spray (the aerosol leaves a sticky residue that degrades the coating).' },
  { id: 'cw-4', category: 'cookware', body: 'The heaviest sheet pan you own is your best sheet pan. Thin pans warp under high heat and scorch whatever is near the edges. A heavy-gauge aluminum half-sheet is the single most versatile piece in your kitchen after a chef\'s knife.' },
  { id: 'cw-5', category: 'cookware', body: 'Stainless steel sticks when the pan is not hot enough. Heat the dry pan first, then add oil, then food. Test with a drop of water — when it beads and skitters like mercury instead of sizzling away, the pan is ready.' },
  { id: 'cw-6', category: 'cookware', body: 'Wooden spoons and cutting boards never go in the dishwasher — the heat and soaking crack the grain and loosen glue joints. Hand-wash, dry upright, and rub with food-grade mineral oil once a month to keep them from drying out.' },
  { id: 'cw-7', category: 'cookware', body: 'A Dutch oven is two tools in one: sear your meat in it first, then braise in the same pot to keep every browned bit in the dish. One caution — never preheat enameled cast iron empty, as the coating can crack without contents to absorb the heat.' },
  { id: 'cw-8', category: 'cookware', body: 'An instant-read thermometer is the cheapest upgrade your cooking will ever get. It ends guesswork on roasts, bread, custards, and frying oil alike. Probe from the side toward the center of thin cuts — the tip needs to sit in the middle of the meat.' },

  // ── Ingredients ────────────────────────────────────────────────────────
  { id: 'ig-1', category: 'ingredients', body: 'Room-temperature eggs whip higher and incorporate more evenly into batters. If you forget to pull them early, set them in a bowl of warm (not hot) tap water for 5 minutes — same result, no waiting.' },
  { id: 'ig-2', category: 'ingredients', body: 'Butter labeled "European-style" (82–85% butterfat vs. 80% in standard American butter) makes a noticeable difference in pastry and shortbread. For everyday sautéing the standard stuff is fine — save the good butter for baking.' },
  { id: 'ig-3', category: 'ingredients', body: 'Onions and garlic go into the pan in that order. Garlic burns fast — 30 seconds is enough to go from fragrant to acrid. Sauté your onions first until translucent, then add minced garlic at the very end, just until you smell it.' },
  { id: 'ig-4', category: 'ingredients', body: 'Fresh herbs and dried herbs are not interchangeable. Dried herbs are concentrated and should go in early (they need time to rehydrate and bloom). Fresh herbs are delicate — stir them in right before serving or they will lose their punch.' },
  { id: 'ig-5', category: 'ingredients', body: 'Salt your pasta water until it tastes like the sea. The pasta absorbs water as it cooks, and if that water is under-salted your dish will taste flat even after you sauce it. One tablespoon of kosher salt per quart of water is a good starting point.' },
  { id: 'ig-6', category: 'ingredients', body: 'Lemon zest carries more flavor than lemon juice. The oils in the peel are where most of the aroma lives. Whenever a recipe calls for juice, zest the fruit first — it is free flavor you would otherwise throw away.' },
  { id: 'ig-7', category: 'ingredients', body: 'Save your Parmesan rinds. Tossed into a pot of soup, beans, or tomato sauce, a rind slowly releases savory depth you cannot buy in a jar. Keep a bag of them in the freezer and drop one in anything that simmers longer than 20 minutes.' },
  { id: 'ig-8', category: 'ingredients', body: 'Buy whole peeled canned tomatoes and crush them by hand. Whole tomatoes are packed from the best fruit; pre-crushed and diced grades are often firmer, blander, and treated with calcium chloride so the pieces never break down in your sauce.' },

  // ── Technique ──────────────────────────────────────────────────────────
  { id: 'te-1', category: 'technique', body: 'Taste as you go — and season at every stage. A pinch of salt added to the onions, another to the tomatoes, and a final flake at the table layers flavor in a way that a single dump at the end cannot replicate.' },
  { id: 'te-2', category: 'technique', body: 'Rest your meat after cooking. A steak or roast will climb 5–10°F internally after leaving the heat, and resting for 5–10 minutes lets the juices redistribute. Cut too soon and your cutting board will drink what should have stayed in the meat.' },
  { id: 'te-3', category: 'technique', body: 'Mise en place — "everything in its place" — is the single habit that separates calm cooks from frantic ones. Measure, chop, and arrange every ingredient before you turn on the stove. Recipes move fast once heat is involved.' },
  { id: 'te-4', category: 'technique', body: 'Deglazing is free sauce. After searing meat or vegetables, those browned bits stuck to the pan are pure flavor. Pour in a splash of wine, broth, or even water while the pan is still hot, scrape with a wooden spoon, and you have the foundation of a pan sauce in seconds.' },
  { id: 'te-5', category: 'technique', body: 'Knead bread by feel, not by clock. The windowpane test tells you when gluten is developed: stretch a walnut-sized piece of dough between your fingers. If it forms a thin, translucent membrane without tearing, you are done — no matter what the recipe timer says.' },
  { id: 'te-6', category: 'technique', body: 'Toast your spices. Whole seeds and ground spices bloom in a dry pan over medium heat for 30–60 seconds — you will smell the transformation. Toast first, then grind. The difference between toasted cumin and raw cumin is the difference between a dish that whispers and one that announces itself.' },
  { id: 'te-7', category: 'technique', body: 'Dry meat sears; wet meat steams. Pat every steak, chop, and chicken thigh dry with paper towels before it hits the pan — surface moisture has to boil off before browning can even begin, and by then the inside is overcooked.' },
  { id: 'te-8', category: 'technique', body: 'That cloudy pasta water is liquid gold. The starch it carries binds sauce to noodles and turns a broken, oily pan into a glossy emulsion. Scoop out a cup before you drain, finish the pasta in the sauce, and loosen with splashes of the water as you toss.' },

  // ── Baking ─────────────────────────────────────────────────────────────
  { id: 'ba-1', category: 'baking', body: 'Weigh your flour. Scooping straight from the bag packs in up to 20% more than the recipe intends — the difference between tender and tough. No scale? Fluff the flour, spoon it into the cup, and level with a knife. Never tap or press.' },
  { id: 'ba-2', category: 'baking', body: '"Room-temperature butter" means cool to the touch but yielding — press it and your finger should leave a dent without sinking in. Too soft and it cannot hold the air that creaming is supposed to whip into it, and your cookies spread flat.' },
  { id: 'ba-3', category: 'baking', body: 'Lumpy batter is happy batter. For muffins, pancakes, and quick breads, stir only until the flour disappears — every extra fold develops gluten and trades tenderness for chew. Streaks and small lumps bake out; overmixing never does.' },
  { id: 'ba-4', category: 'baking', body: 'Your oven lies. Most run 15–25°F off their dial, which is the difference between golden and scorched in a bake. A $10 oven thermometer hung from the middle rack tells you the truth — check it once and learn your oven\'s personality.' },
  { id: 'ba-5', category: 'baking', body: 'Ovens have hot spots, so rotate your pans 180° halfway through baking — and swap racks if you are baking two sheets at once. Wait until the structure is set (about two-thirds through) for delicate cakes so the rotation does not deflate them.' },
  { id: 'ba-6', category: 'baking', body: 'Chill your cookie dough — overnight if you can bear it. Resting hydrates the flour, deepens the butterscotch notes as sugars break down, and firm cold dough spreads less in the oven, giving you thick, chewy centers instead of thin, brittle discs.' },
  { id: 'ba-7', category: 'baking', body: 'Yeast is alive, and dead yeast is the silent killer of flat bread. If your packet is past its date, prove it first: stir it into warm water (about 105°F) with a pinch of sugar. Foamy in 10 minutes means go; still liquid means buy fresh yeast.' },
  { id: 'ba-8', category: 'baking', body: 'Parchment paper beats greasing nearly every time — nothing sticks, edges brown evenly, and cleanup is lifting a sheet. Cut a round for cake pans, leave an overhang in loaf pans and brownie pans, and reuse sheets for cookies until they darken.' },

  // ── Produce ────────────────────────────────────────────────────────────
  { id: 'pr-1', category: 'produce', body: 'To ripen an avocado fast, seal it in a paper bag with a banana — the trapped ethylene does in a day what the counter does in four. The moment it yields to gentle pressure, move it to the fridge, where it will hold at peak for several days.' },
  { id: 'pr-2', category: 'produce', body: 'Limp celery, wilted greens, and bendy carrots are dehydrated, not dead. Fifteen minutes in a bowl of ice water and they snap back to crisp. It works for herbs, lettuce, even flabby radishes — revive before you resign them to the compost.' },
  { id: 'pr-3', category: 'produce', body: 'Never wash berries until the moment you eat them — moisture is what molds them. To stretch their life, give them a 30-second bath in three parts water to one part vinegar, then dry completely. The rinse kills surface spores and adds days.' },
  { id: 'pr-4', category: 'produce', body: 'Garlic flavor is a dial, not a switch: the finer you cut, the stronger it gets. Whole cloves whisper, slices speak, minced shouts, and pressed screams. Smash a clove with the flat of your knife first and the peel slips right off.' },
  { id: 'pr-5', category: 'produce', body: 'Cold citrus is stingy citrus. Juice lemons and limes at room temperature — or give chilled fruit 20 seconds of firm rolling under your palm — and you will get noticeably more juice from the same fruit. Zest before juicing, always.' },
  { id: 'pr-6', category: 'produce', body: 'Mushrooms are sponges, so never soak them — wipe with a damp towel or give a fast rinse right before cooking. Store them in a paper bag in the fridge, not plastic: the bag breathes, the mushrooms stay dry, and slime never gets a foothold.' },
  { id: 'pr-7', category: 'produce', body: 'Keep a stock bag in the freezer: onion ends, carrot peels, celery leaves, herb stems, mushroom trimmings. When it fills, simmer it all for an hour with a bay leaf and you have free vegetable stock better than anything in a carton.' },
  { id: 'pr-8', category: 'produce', body: 'Shop the season. In-season produce is cheaper, closer, and picked riper — an August tomato and a January tomato are different foods. Off-season, canned tomatoes and frozen peas beat their fresh-but-shipped versions almost every time.' },

  // ── Storage ────────────────────────────────────────────────────────────
  { id: 'st-1', category: 'storage', body: 'Store potatoes and onions apart. Onions release ethylene gas that causes potatoes to sprout. Keep both in a cool, dark, well-ventilated spot — not the fridge (cold converts potato starch to sugar, giving them a sweet, gritty texture when cooked).' },
  { id: 'st-2', category: 'storage', body: 'Herbs stay fresh longer when treated like flowers. Trim the stems, stand them in a jar with an inch of water, and cover loosely with a plastic bag in the fridge. Basil is the exception — it hates the cold and does better on the counter.' },
  { id: 'st-3', category: 'storage', body: 'Bananas ripen everything around them. They produce more ethylene than almost any other fruit. Keep them away from your other produce unless you want everything to turn yellow (and then brown) ahead of schedule.' },
  { id: 'st-4', category: 'storage', body: 'Freeze fresh ginger whole. It grates easily from frozen on a microplane and lasts for months instead of shriveling in the crisper drawer. No need to peel it first — the skin is thin enough that frozen grated ginger works in any recipe.' },
  { id: 'st-5', category: 'storage', body: 'Bread goes stale in the fridge faster than on the counter (a phenomenon called retrogradation). Keep what you will eat in 3–4 days at room temperature in a paper bag. Freeze the rest — sliced, so you can toast individual pieces straight from frozen.' },
  { id: 'st-6', category: 'storage', body: 'Never refrigerate a tomato that is not fully ripe — cold kills the enzymes that produce flavor and turns the flesh mealy. Ripen on the counter stem-side down (the shoulder is the sturdiest part), and only refrigerate a dead-ripe tomato you cannot eat in time.' },
  { id: 'st-7', category: 'storage', body: 'Nuts, seeds, and whole-grain flours carry oils that slowly go rancid at room temperature — that bitter, paint-like edge in old walnuts. Store what you will not use within a month in the freezer, where they keep for a year with no loss of crunch.' },
  { id: 'st-8', category: 'storage', body: 'Front-and-center is a storage strategy: keep the food that expires soonest at eye level, not buried in a drawer. Most fridge waste is not food that went bad too fast — it is food that was never seen again after the day it went in.' },

  // ── Freezer smarts ─────────────────────────────────────────────────────
  { id: 'fz-1', category: 'freezer', body: 'Freeze flat. Soups, stews, sauces, and ground meat pressed thin in zip-top bags stack like books, freeze in half the time, and thaw in minutes under cold water instead of hours as a frozen brick.' },
  { id: 'fz-2', category: 'freezer', body: 'Portion before you freeze. Tomato paste in tablespoon dollops, stock in ice-cube trays, cookie dough in pre-scooped balls — future-you needs two cubes of stock, not a quart-sized block welded around the exact amount you wanted.' },
  { id: 'fz-3', category: 'freezer', body: 'Label everything with contents and date — painter\'s tape and a marker are all you need. Every freezer eventually grows a shelf of frost-bearded mystery containers, and unlabeled food is food you will eventually throw away unopened.' },
  { id: 'fz-4', category: 'freezer', body: 'Thaw in the fridge, not on the counter. Overnight in the fridge keeps meat cold and safe the whole way; a counter thaw leaves the outside sitting in the bacterial danger zone while the middle catches up. In a hurry, use sealed bags in cold water.' },
  { id: 'fz-5', category: 'freezer', body: 'Freezer burn is not spoilage — it is dehydration where air touched food. It is safe to eat but tastes flat and woolly. The cure is prevention: wrap tightly, press the air out of bags, and use rigid containers filled close to the top.' },
  { id: 'fz-6', category: 'freezer', body: 'Chop leftover fresh herbs, pack them into ice-cube trays, and cover with olive oil before freezing. Each cube is a ready-made flavor base — drop one into a hot pan and you have herbs and cooking fat for a weeknight sauté in one move.' },
  { id: 'fz-7', category: 'freezer', body: 'Bananas past their prime are a baking asset. Peel them first (frozen peels are miserable to remove), freeze in a bag, and you have a standing supply for banana bread and smoothies — freezing even sweetens them as the starches convert.' },
  { id: 'fz-8', category: 'freezer', body: 'Run your freezer first-in, first-out: newest to the back, oldest up front where you will grab it. A freezer is not an archive — most frozen food is at its best inside three months, so make the front row this month\'s dinners.' },

  // ── Food safety ────────────────────────────────────────────────────────
  { id: 'fs-1', category: 'safety', body: 'Give raw meat its own cutting board. Juices work into the knife scars of a board, and no quick rinse gets them out — cross-contamination onto the salad you chop next is how kitchens make people sick. Two boards, two colors, no confusion.' },
  { id: 'fs-2', category: 'safety', body: 'The danger zone is 40–140°F — bacteria double every 20 minutes there. The working rule: perishable food should not sit out longer than 2 hours (1 hour on a hot day). Buffet leftovers that lingered all afternoon are not worth the gamble.' },
  { id: 'fs-3', category: 'safety', body: 'Do not wash raw chicken. The rinse kills nothing — cooking does that — but the spray aerosolizes bacteria across your sink, faucet, and counters up to three feet away. Pat dry with paper towels, toss them, wash your hands, and cook it through.' },
  { id: 'fs-4', category: 'safety', body: 'Your fridge should hold at or below 40°F and your freezer at 0°F, and the built-in dial is not a measurement. A cheap appliance thermometer on the middle shelf tells you the truth — especially worth checking after a power flicker or a heavy grocery load.' },
  { id: 'fs-5', category: 'safety', body: 'Leftovers keep 3–4 days in the fridge — count the days, not the smell. Reheat until steaming hot throughout (165°F), not just warmed through. Soups and sauces get a full rolling boil; the microwave needs a stir halfway to kill the cold spots.' },
  { id: 'fs-6', category: 'safety', body: 'A big pot of hot soup does not go straight into the fridge — the core stays warm for hours, and it heats everything around it. Divide into shallow containers first; food cools through the danger zone in a fraction of the time, refrigerate within two hours.' },
  { id: 'fs-7', category: 'safety', body: 'When in doubt, throw it out. Smell and appearance catch spoilage bacteria, but the pathogens that cause food poisoning are invisible and odorless — food can smell perfectly fine and still make you sick. No leftover is worth two days on the couch.' },
  { id: 'fs-8', category: 'safety', body: 'Wash your hands like it matters: 20 seconds with soap, before cooking and immediately after touching raw meat, poultry, or eggs. Dry with a clean towel — the hand towel that has wiped counters all week undoes the wash.' },

  // ── General ────────────────────────────────────────────────────────────
  { id: 'ge-1', category: 'general', body: 'A dull knife is more dangerous than a sharp one — it requires more force, which means less control and a higher chance of slipping. Honing realigns the edge between sharpenings; run the blade over a honing steel every few uses and sharpen once or twice a year.' },
  { id: 'ge-2', category: 'general', body: 'Read a recipe all the way through before you start. Not skimming — reading. The step that says "chill for 2 hours" hidden in the middle is not the surprise you want at 6 PM on a Tuesday.' },
  { id: 'ge-3', category: 'general', body: 'Fat carries flavor, acid brightens it, and salt amplifies it. If a dish tastes flat but you already salted it, try a squeeze of lemon or a splash of vinegar before reaching for the salt shaker again. You will be surprised how often that fixes it.' },
  { id: 'ge-4', category: 'general', body: 'Clean as you go. Fill the sink with hot soapy water before you start cooking and drop in utensils, bowls, and measuring cups as you finish with them. By the time dinner is on the table your cleanup is already half done.' },
  { id: 'ge-5', category: 'general', body: 'Your freezer is the most underrated tool in your kitchen. Soups, stews, cooked grains, shredded cheese, cookie dough, and even whole casseroles freeze beautifully. A well-stocked freezer means dinner is always one thaw away.' },
  { id: 'ge-6', category: 'general', body: 'A tablespoon of table salt is nearly twice as salty as a tablespoon of Diamond Crystal kosher salt — the crystals pack differently. When a recipe names a salt, take it seriously, and when converting, halve table salt in place of kosher (or double the other way).' },
  { id: 'ge-7', category: 'general', body: 'Build a small acid shelf: red wine vinegar, rice vinegar, sherry vinegar, and a lemon or two. Different acids brighten different dishes — rice vinegar for gentle, sherry for deep and nutty — and a finishing splash wakes up more dishes than more salt does.' },
  { id: 'ge-8', category: 'general', body: 'Cook once, eat twice. Doubling rice, roasted vegetables, or a pot of beans costs five extra minutes tonight and saves thirty tomorrow — tomorrow\'s fried rice, grain bowl, or soup is already half-made. Leftover components beat leftover meals.' },
];

/**
 * Deterministic daily pick: hash the YYYY-MM-DD prefix (djb2) into the tip
 * list. Same date → same tip on every device; consecutive dates scatter
 * across the library. Time-of-day and timezone suffixes are ignored.
 */
export function tipOfTheDay(dateISO: string): Tip {
  const day = dateISO.slice(0, 10);
  let h = 5381;
  for (let i = 0; i < day.length; i++) {
    h = (h * 33 + day.charCodeAt(i)) >>> 0;
  }
  return KITCHEN_TIPS[h % KITCHEN_TIPS.length];
}
