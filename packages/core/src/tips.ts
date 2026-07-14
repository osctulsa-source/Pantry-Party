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
  | 'storage'
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
  storage: { label: 'Storage' },
  general: { label: 'General' },
};

export const TIP_CATEGORY_ORDER: TipCategory[] = [
  'cookware',
  'ingredients',
  'technique',
  'storage',
  'general',
];

export const KITCHEN_TIPS: Tip[] = [
  // ── Cookware ───────────────────────────────────────────────────────────
  { id: 'cw-1', category: 'cookware', body: "Don't crowd the pan. When you pile food into a skillet the temperature drops and your ingredients steam instead of sear. Cook in batches — the crust is worth the wait." },
  { id: 'cw-2', category: 'cookware', body: 'Cast iron retains heat better than any other pan. Let it preheat for 5–7 minutes on medium before adding oil, then another 30 seconds before food touches the surface. You will get a restaurant-quality sear every time.' },
  { id: 'cw-3', category: 'cookware', body: 'Nonstick pans have a lifespan. Once the coating shows scratches or food starts clinging, it is done. Replace every 2–3 years and never use metal utensils or cooking spray (the aerosol leaves a sticky residue that degrades the coating).' },
  { id: 'cw-4', category: 'cookware', body: 'The heaviest sheet pan you own is your best sheet pan. Thin pans warp under high heat and scorch whatever is near the edges. A heavy-gauge aluminum half-sheet is the single most versatile piece in your kitchen after a chef\'s knife.' },

  // ── Ingredients ────────────────────────────────────────────────────────
  { id: 'ig-1', category: 'ingredients', body: 'Room-temperature eggs whip higher and incorporate more evenly into batters. If you forget to pull them early, set them in a bowl of warm (not hot) tap water for 5 minutes — same result, no waiting.' },
  { id: 'ig-2', category: 'ingredients', body: 'Butter labeled "European-style" (82–85% butterfat vs. 80% in standard American butter) makes a noticeable difference in pastry and shortbread. For everyday sautéing the standard stuff is fine — save the good butter for baking.' },
  { id: 'ig-3', category: 'ingredients', body: 'Onions and garlic go into the pan in that order. Garlic burns fast — 30 seconds is enough to go from fragrant to acrid. Sauté your onions first until translucent, then add minced garlic at the very end, just until you smell it.' },
  { id: 'ig-4', category: 'ingredients', body: 'Fresh herbs and dried herbs are not interchangeable. Dried herbs are concentrated and should go in early (they need time to rehydrate and bloom). Fresh herbs are delicate — stir them in right before serving or they will lose their punch.' },
  { id: 'ig-5', category: 'ingredients', body: 'Salt your pasta water until it tastes like the sea. The pasta absorbs water as it cooks, and if that water is under-salted your dish will taste flat even after you sauce it. One tablespoon of kosher salt per quart of water is a good starting point.' },
  { id: 'ig-6', category: 'ingredients', body: 'Lemon zest carries more flavor than lemon juice. The oils in the peel are where most of the aroma lives. Whenever a recipe calls for juice, zest the fruit first — it is free flavor you would otherwise throw away.' },

  // ── Technique ──────────────────────────────────────────────────────────
  { id: 'te-1', category: 'technique', body: 'Taste as you go — and season at every stage. A pinch of salt added to the onions, another to the tomatoes, and a final flake at the table layers flavor in a way that a single dump at the end cannot replicate.' },
  { id: 'te-2', category: 'technique', body: 'Rest your meat after cooking. A steak or roast will climb 5–10°F internally after leaving the heat, and resting for 5–10 minutes lets the juices redistribute. Cut too soon and your cutting board will drink what should have stayed in the meat.' },
  { id: 'te-3', category: 'technique', body: 'Mise en place — "everything in its place" — is the single habit that separates calm cooks from frantic ones. Measure, chop, and arrange every ingredient before you turn on the stove. Recipes move fast once heat is involved.' },
  { id: 'te-4', category: 'technique', body: 'Deglazing is free sauce. After searing meat or vegetables, those browned bits stuck to the pan are pure flavor. Pour in a splash of wine, broth, or even water while the pan is still hot, scrape with a wooden spoon, and you have the foundation of a pan sauce in seconds.' },
  { id: 'te-5', category: 'technique', body: 'Knead bread by feel, not by clock. The windowpane test tells you when gluten is developed: stretch a walnut-sized piece of dough between your fingers. If it forms a thin, translucent membrane without tearing, you are done — no matter what the recipe timer says.' },
  { id: 'te-6', category: 'technique', body: 'Toast your spices. Whole seeds and ground spices bloom in a dry pan over medium heat for 30–60 seconds — you will smell the transformation. Toast first, then grind. The difference between toasted cumin and raw cumin is the difference between a dish that whispers and one that announces itself.' },

  // ── Storage ────────────────────────────────────────────────────────────
  { id: 'st-1', category: 'storage', body: 'Store potatoes and onions apart. Onions release ethylene gas that causes potatoes to sprout. Keep both in a cool, dark, well-ventilated spot — not the fridge (cold converts potato starch to sugar, giving them a sweet, gritty texture when cooked).' },
  { id: 'st-2', category: 'storage', body: 'Herbs stay fresh longer when treated like flowers. Trim the stems, stand them in a jar with an inch of water, and cover loosely with a plastic bag in the fridge. Basil is the exception — it hates the cold and does better on the counter.' },
  { id: 'st-3', category: 'storage', body: 'Bananas ripen everything around them. They produce more ethylene than almost any other fruit. Keep them away from your other produce unless you want everything to turn yellow (and then brown) ahead of schedule.' },
  { id: 'st-4', category: 'storage', body: 'Freeze fresh ginger whole. It grates easily from frozen on a microplane and lasts for months instead of shriveling in the crisper drawer. No need to peel it first — the skin is thin enough that frozen grated ginger works in any recipe.' },
  { id: 'st-5', category: 'storage', body: 'Bread goes stale in the fridge faster than on the counter (a phenomenon called retrogradation). Keep what you will eat in 3–4 days at room temperature in a paper bag. Freeze the rest — sliced, so you can toast individual pieces straight from frozen.' },

  // ── General ────────────────────────────────────────────────────────────
  { id: 'ge-1', category: 'general', body: 'A dull knife is more dangerous than a sharp one — it requires more force, which means less control and a higher chance of slipping. Honing realigns the edge between sharpenings; run the blade over a honing steel every few uses and sharpen once or twice a year.' },
  { id: 'ge-2', category: 'general', body: 'Read a recipe all the way through before you start. Not skimming — reading. The step that says "chill for 2 hours" hidden in the middle is not the surprise you want at 6 PM on a Tuesday.' },
  { id: 'ge-3', category: 'general', body: 'Fat carries flavor, acid brightens it, and salt amplifies it. If a dish tastes flat but you already salted it, try a squeeze of lemon or a splash of vinegar before reaching for the salt shaker again. You will be surprised how often that fixes it.' },
  { id: 'ge-4', category: 'general', body: 'Clean as you go. Fill the sink with hot soapy water before you start cooking and drop in utensils, bowls, and measuring cups as you finish with them. By the time dinner is on the table your cleanup is already half done.' },
  { id: 'ge-5', category: 'general', body: 'Your freezer is the most underrated tool in your kitchen. Soups, stews, cooked grains, shredded cheese, cookie dough, and even whole casseroles freeze beautifully. A well-stocked freezer means dinner is always one thaw away.' },
];
