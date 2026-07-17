/**
 * Curated common staples for one-tap add. `category` drives the smart expiry
 * default (via @breadbox/core's suggestExpiryISO); `noExpiry` marks effectively
 * shelf-stable items (salt, sugar, honey…) so we don't slap a fake date on them.
 */
import type { StorageLocation } from '@breadbox/core';

export interface Staple {
  name: string;
  category: string;
  location: StorageLocation;
  noExpiry?: boolean;
}

export const STAPLE_GROUPS: Array<{ title: string; items: Staple[] }> = [
  {
    title: 'Baking',
    items: [
      { name: 'Flour', category: 'pantry', location: 'pantry' },
      { name: 'Sugar', category: 'pantry', location: 'pantry', noExpiry: true },
      { name: 'Brown sugar', category: 'pantry', location: 'pantry', noExpiry: true },
      { name: 'Baking soda', category: 'pantry', location: 'pantry' },
      { name: 'Baking powder', category: 'pantry', location: 'pantry' },
      { name: 'Salt', category: 'pantry', location: 'pantry', noExpiry: true },
      { name: 'Yeast', category: 'pantry', location: 'pantry' },
    ],
  },
  {
    title: 'Oils & sauces',
    items: [
      { name: 'Olive oil', category: 'pantry', location: 'pantry' },
      { name: 'Vegetable oil', category: 'pantry', location: 'pantry' },
      { name: 'Soy sauce', category: 'pantry', location: 'pantry' },
      { name: 'Ketchup', category: 'pantry', location: 'fridge' },
      { name: 'Mustard', category: 'pantry', location: 'fridge' },
      { name: 'Mayonnaise', category: 'pantry', location: 'fridge' },
      { name: 'Hot sauce', category: 'pantry', location: 'fridge' },
      { name: 'Vinegar', category: 'pantry', location: 'pantry', noExpiry: true },
      { name: 'Honey', category: 'pantry', location: 'pantry', noExpiry: true },
    ],
  },
  {
    title: 'Grains & pasta',
    items: [
      { name: 'Rice', category: 'pantry', location: 'pantry' },
      { name: 'Pasta', category: 'pantry', location: 'pantry' },
      { name: 'Oats', category: 'pantry', location: 'pantry' },
      { name: 'Bread', category: 'bakery', location: 'pantry' },
    ],
  },
  {
    title: 'Canned & basics',
    items: [
      { name: 'Canned tomatoes', category: 'pantry', location: 'pantry' },
      { name: 'Canned beans', category: 'pantry', location: 'pantry' },
      { name: 'Stock', category: 'pantry', location: 'pantry' },
      { name: 'Black pepper', category: 'pantry', location: 'pantry', noExpiry: true },
    ],
  },
  {
    title: 'Fruits',
    items: [
      { name: 'Apple', category: 'produce', location: 'pantry' },
      { name: 'Banana', category: 'produce', location: 'pantry' },
      { name: 'Lemon', category: 'produce', location: 'pantry' },
      { name: 'Orange', category: 'produce', location: 'pantry' },
      { name: 'Grapes', category: 'produce', location: 'fridge' },
      { name: 'Strawberries', category: 'produce', location: 'fridge' },
      { name: 'Avocado', category: 'produce', location: 'pantry' },
      { name: 'Lime', category: 'produce', location: 'pantry' },
    ],
  },
  {
    title: 'Vegetables',
    items: [
      { name: 'Onion', category: 'produce', location: 'pantry' },
      { name: 'Garlic', category: 'produce', location: 'pantry' },
      { name: 'Potato', category: 'produce', location: 'pantry' },
      { name: 'Carrot', category: 'produce', location: 'fridge' },
      { name: 'Tomato', category: 'produce', location: 'pantry' },
      { name: 'Bell pepper', category: 'produce', location: 'fridge' },
      { name: 'Broccoli', category: 'produce', location: 'fridge' },
      { name: 'Lettuce', category: 'produce', location: 'fridge' },
    ],
  },
  {
    title: 'Drinks',
    items: [
      { name: 'Water', category: 'beverage', location: 'pantry', noExpiry: true },
      { name: 'Sparkling water', category: 'beverage', location: 'pantry' },
      { name: 'Orange juice', category: 'beverage', location: 'fridge' },
      { name: 'Coffee', category: 'beverage', location: 'pantry', noExpiry: true },
      { name: 'Tea', category: 'beverage', location: 'pantry', noExpiry: true },
      { name: 'Soda', category: 'beverage', location: 'pantry' },
    ],
  },
  {
    title: 'Fridge basics',
    items: [
      { name: 'Milk', category: 'dairy', location: 'fridge' },
      { name: 'Eggs', category: 'dairy', location: 'fridge' },
      { name: 'Butter', category: 'dairy', location: 'fridge' },
    ],
  },
];
