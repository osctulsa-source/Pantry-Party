/**
 * CategoryIcon — a lucide glyph for a pantry item's category, with a neutral
 * fallback when the category is missing or unrecognized.
 *
 * Items don't store photos (no image field), so the Pantry rows use a small
 * category icon in a tinted circle instead. The category set mirrors
 * @breadbox/core's DEFAULT_SHELF_LIFE keys (produce / dairy / meat / frozen /
 * pantry / bakery / beverage); anything else (incl. uncategorized manual adds)
 * falls back to a generic basket. Rendered via a switch — same pattern as the
 * History screen's KindIcon — so a lucide ForwardRefExoticComponent never has
 * to be assigned into a ComponentType field under strict TS.
 */
import {
  Beef,
  Carrot,
  Croissant,
  CupSoda,
  Milk,
  Package,
  ShoppingBasket,
  Snowflake,
} from 'lucide-react-native';

import { tokens } from '../../theme/tokens';

export function CategoryIcon({
  category,
  size = 18,
  color = tokens.color.accent,
}: {
  category?: string | null;
  size?: number;
  color?: string;
}) {
  switch ((category ?? '').toLowerCase()) {
    case 'produce':
      return <Carrot size={size} color={color} />;
    case 'dairy':
      return <Milk size={size} color={color} />;
    case 'meat':
      return <Beef size={size} color={color} />;
    case 'frozen':
      return <Snowflake size={size} color={color} />;
    case 'bakery':
      return <Croissant size={size} color={color} />;
    case 'beverage':
      return <CupSoda size={size} color={color} />;
    case 'pantry':
      return <Package size={size} color={color} />;
    default:
      return <ShoppingBasket size={size} color={color} />;
  }
}
