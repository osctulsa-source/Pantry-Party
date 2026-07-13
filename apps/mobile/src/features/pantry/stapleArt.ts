/**
 * stapleArt — staple name → loaf-mark glyph, one glyph per staple (enforced
 * by test). Lives beside staples.ts but separate so art changes never touch
 * staple data. Unknown names fall back to 'jar' so a future staple addition
 * can't crash the picker (the completeness test makes the gap loud in CI).
 */
import type { BrandFoodName } from '../../components/BrandIcon';

export const STAPLE_ART: Record<string, BrandFoodName> = {
  // Baking
  Flour: 'floursack',
  Sugar: 'sugarbowl',
  'Brown sugar': 'sugarbag',
  'Baking soda': 'sodabox',
  'Baking powder': 'powdertin',
  Salt: 'saltshaker',
  Yeast: 'yeastpacket',
  // Oils & sauces
  'Olive oil': 'oliveoilbottle',
  'Vegetable oil': 'oiljug',
  'Soy sauce': 'soybottle',
  Ketchup: 'ketchupbottle',
  Mustard: 'mustardbottle',
  Mayonnaise: 'mayojar',
  'Hot sauce': 'hotsaucebottle',
  Vinegar: 'vinegarflask',
  Honey: 'honeypot',
  // Grains & pasta
  Rice: 'ricebowl',
  Pasta: 'spaghetti',
  Oats: 'oatcanister',
  Bread: 'bread',
  // Canned & basics
  'Canned tomatoes': 'tomatocan',
  'Canned beans': 'beancan',
  Stock: 'stockcarton',
  'Black pepper': 'peppergrinder',
  // Drinks (group ships with the in-flight lazy-kitchen work — mapped ahead)
  Water: 'waterglass',
  'Sparkling water': 'fizzybottle',
  'Orange juice': 'juicecarton',
  Coffee: 'coffeemug',
  Tea: 'teacup',
  Soda: 'sodacan',
  // Fridge basics
  Milk: 'milkjug',
  Eggs: 'egg',
  Butter: 'butterdish',
};

export function stapleGlyph(name: string): BrandFoodName {
  const glyph = STAPLE_ART[name];
  if (glyph === undefined && __DEV__) {
    console.warn(`stapleArt: no glyph for "${name}" — falling back to jar`);
  }
  return glyph ?? 'jar';
}
