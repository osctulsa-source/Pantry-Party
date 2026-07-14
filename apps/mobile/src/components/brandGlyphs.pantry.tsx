/**
 * brandGlyphs.pantry — staple-picker glyphs (one per staple, no sharing).
 * Same construction rule as the core family: solid `body` silhouette, 2–3
 * `cut` marks, `leaf` only where botanically natural. Marks OUTSIDE the
 * silhouette (steam, handles, strings) use `body` — `cut` is the panel color.
 */
import { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import type { BrandTone } from '../theme/brandPalette';
import type { Paint } from './brandGlyphs.core';

export type PantryFoodName =
  | 'floursack' | 'sugarbowl' | 'sugarbag' | 'sodabox' | 'powdertin' | 'saltshaker' | 'yeastpacket'
  | 'oliveoilbottle' | 'oiljug' | 'soybottle' | 'ketchupbottle' | 'mustardbottle' | 'mayojar' | 'hotsaucebottle' | 'vinegarflask' | 'honeypot'
  | 'ricebowl' | 'spaghetti' | 'oatcanister' | 'tomatocan' | 'beancan' | 'stockcarton' | 'peppergrinder'
  | 'waterglass' | 'fizzybottle' | 'juicecarton' | 'coffeemug' | 'teacup' | 'sodacan' | 'milkjug' | 'butterdish' | 'wheat' | 'peanut' | 'shrimp'
  | 'stove' | 'oven' | 'crockpot' | 'airfryer' | 'grill' | 'griddle' | 'instantpot' | 'sheetpan' | 'microwave' | 'nocook';

export const PANTRY_GLYPHS: Record<PantryFoodName, (c: Paint) => React.ReactNode> = {
  // Rolled-top flour sack, stitch marks.
  floursack: ({ body, cut }) => (
    <>
      <Path d="M14 40 L14 24 Q14 18 19 17 L29 17 Q34 18 34 24 L34 40 Z" fill={body} />
      <Path d="M18 17 L30 17 L28 11 L20 11 Z" fill={body} />
      <Path d="M20 28 h8" fill="none" stroke={cut} />
      <Path d="M20 33 h8" fill="none" stroke={cut} />
    </>
  ),
  // Lidded sugar bowl, knob, cube alongside.
  sugarbowl: ({ body, cut }) => (
    <>
      <Path d="M13 27 Q13 38 24 38 Q35 38 35 27 Z" fill={body} />
      <Path d="M14 27 Q14 20 24 20 Q34 20 34 27 Z" fill={body} />
      <Circle cx={24} cy={17} r={2.5} fill={body} />
      <Path d="M16 27 h16" fill="none" stroke={cut} />
      <Rect x={35} y={33} width={5} height={5} rx={1} fill={body} />
    </>
  ),
  // Soft brown-sugar bag with a folded top and grain specks.
  sugarbag: ({ body, cut }) => (
    <>
      <Path d="M16 40 Q13 30 17 21 L21 15 H27 L31 21 Q35 30 32 40 Z" fill={body} />
      <Path d="M21 15 L24 20 L27 15" fill="none" stroke={cut} />
      <Circle cx={21} cy={30} r={1.3} fill={cut} />
      <Circle cx={26} cy={33} r={1.3} fill={cut} />
      <Circle cx={23} cy={36} r={1.1} fill={cut} />
    </>
  ),
  // Upright baking-soda box with open flaps and a band.
  sodabox: ({ body, cut }) => (
    <>
      <Rect x={16} y={16} width={16} height={24} rx={2} fill={body} />
      <Path d="M16 16 L20 10 H28 L32 16 Z" fill={body} />
      <Path d="M16 26 h16" fill="none" stroke={cut} />
      <Circle cx={24} cy={33} r={2} fill={cut} />
    </>
  ),
  // Squat round baking-powder tin with a lid lip.
  powdertin: ({ body, cut }) => (
    <>
      <Rect x={15} y={20} width={18} height={18} rx={3} fill={body} />
      <Rect x={13} y={15} width={22} height={7} rx={3} fill={body} />
      <Path d="M19 30 h10" fill="none" stroke={cut} />
    </>
  ),
  // Domed salt shaker, three pour holes, waist line.
  saltshaker: ({ body, cut }) => (
    <>
      <Path d="M17 22 Q17 12 24 12 Q31 12 31 22 L31 36 Q31 40 27 40 H21 Q17 40 17 36 Z" fill={body} />
      <Circle cx={21} cy={17} r={1.2} fill={cut} />
      <Circle cx={27} cy={17} r={1.2} fill={cut} />
      <Circle cx={24} cy={14.5} r={1.2} fill={cut} />
      <Path d="M17 24 h14" fill="none" stroke={cut} />
    </>
  ),
  // Yeast sachet with a serration line and grain dots.
  yeastpacket: ({ body, cut }) => (
    <>
      <Rect x={15} y={15} width={18} height={24} rx={2} fill={body} />
      <Path d="M15 20 h18" fill="none" stroke={cut} />
      <Circle cx={20} cy={29} r={1.2} fill={cut} />
      <Circle cx={25} cy={32} r={1.2} fill={cut} />
      <Circle cx={28} cy={27} r={1.2} fill={cut} />
    </>
  ),
  // Slim olive-oil cruet with a pour spout and an olive sprig (leaf natural).
  oliveoilbottle: ({ body, cut, leaf }) => (
    <>
      <Path d="M22 12 h4 v6 l4 6 v13 q0 3 -3 3 h-6 q-3 0 -3 -3 V24 l4 -6 Z" fill={body} />
      <Path d="M22 12 l-3 -3" fill="none" stroke={body} />
      <Path d="M27 13 C30 10 34 11 34 11 C34 14 31 16 28 15 Z" fill={leaf} />
      <Path d="M20 30 h8" fill="none" stroke={cut} />
    </>
  ),
  // Handled vegetable-oil jug with a cap.
  oiljug: ({ body, cut }) => (
    <>
      <Path d="M16 22 l4 -5 v-4 h8 v4 l2 3 v17 q0 3 -3 3 H19 q-3 0 -3 -3 Z" fill={body} />
      <Path d="M31 24 q5 2 3 8" fill="none" stroke={body} />
      <Rect x={20} y={10} width={8} height={3} rx={1} fill={body} />
      <Path d="M20 30 h8" fill="none" stroke={cut} />
    </>
  ),
  // Narrow-waist soy bottle with a collar line.
  soybottle: ({ body, cut }) => (
    <>
      <Path d="M21 12 h6 v7 q5 2 5 8 v10 q0 3 -3 3 h-10 q-3 0 -3 -3 V27 q0 -6 5 -8 Z" fill={body} />
      <Path d="M21 19 h6" fill="none" stroke={cut} />
      <Path d="M19 31 h10" fill="none" stroke={cut} />
    </>
  ),
  // Ketchup squeeze bottle with a cone cap.
  ketchupbottle: ({ body, cut }) => (
    <>
      <Path d="M20 20 q-3 9 0 17 q0 3 3 3 h2 q3 0 3 -3 q3 -8 0 -17 Z" fill={body} />
      <Rect x={21.5} y={14} width={5} height={7} rx={1} fill={body} />
      <Path d="M21 14 L24 9 L27 14 Z" fill={body} />
      <Path d="M21 27 h6" fill="none" stroke={cut} />
    </>
  ),
  // Mustard bottle — squared shoulders, pointed nozzle.
  mustardbottle: ({ body, cut }) => (
    <>
      <Rect x={19} y={18} width={10} height={22} rx={3} fill={body} />
      <Path d="M20 18 l2 -4 h4 l2 4 Z" fill={body} />
      <Path d="M24 8 l1.5 6 h-3 Z" fill={body} />
      <Circle cx={24} cy={28} r={3} fill="none" stroke={cut} />
    </>
  ),
  // Wide mayo jar with a tall lid band and oval label.
  mayojar: ({ body, cut }) => (
    <>
      <Rect x={16} y={20} width={16} height={18} rx={4} fill={body} />
      <Rect x={15} y={13} width={18} height={7} rx={2} fill={body} />
      <Ellipse cx={24} cy={29} rx={4.5} ry={3.5} fill="none" stroke={cut} />
    </>
  ),
  // Small hot-sauce bottle with cap rings.
  hotsaucebottle: ({ body, cut }) => (
    <>
      <Rect x={19} y={22} width={10} height={18} rx={3} fill={body} />
      <Rect x={21.5} y={16} width={5} height={7} fill={body} />
      <Rect x={20.5} y={12} width={7} height={5} rx={1} fill={body} />
      <Path d="M21.5 14.5 h5" fill="none" stroke={cut} />
      <Path d="M22 29 q2 4 4 0" fill="none" stroke={cut} />
    </>
  ),
  // Corked vinegar flask with sloped shoulders.
  vinegarflask: ({ body, cut }) => (
    <>
      <Path d="M21 20 L15 33 q-2 5 3 5 h12 q5 0 3 -5 L27 20 Z" fill={body} />
      <Rect x={21} y={13} width={6} height={8} fill={body} />
      <Rect x={21.5} y={9} width={5} height={4} rx={1} fill={body} />
      <Path d="M19 28 h10" fill="none" stroke={cut} />
    </>
  ),
  // Honey pot with a rim band, drip mark, and dipper handle.
  honeypot: ({ body, cut }) => (
    <>
      <Path d="M15 25 q0 -7 9 -7 q9 0 9 7 q0 13 -9 13 q-9 0 -9 -13 Z" fill={body} />
      <Rect x={17} y={15} width={14} height={4} rx={2} fill={body} />
      <Path d="M30 13 l6 -5" fill="none" stroke={body} />
      <Path d="M20 27 q1 4 3 3" fill="none" stroke={cut} />
    </>
  ),
  // Rice bowl with a mound and grain specks.
  ricebowl: ({ body, cut }) => (
    <>
      <Path d="M16 27 Q16 19 24 19 Q32 19 32 27 Z" fill={body} />
      <Path d="M11 27 Q24 40 37 27 Z" fill={body} />
      <Circle cx={21} cy={23} r={1.2} fill={cut} />
      <Circle cx={26} cy={24} r={1.2} fill={cut} />
      <Circle cx={24} cy={21.5} r={1.1} fill={cut} />
    </>
  ),
  // Standing spaghetti bundle with a tie band and strand lines.
  spaghetti: ({ body, cut }) => (
    <>
      <Rect x={17} y={10} width={14} height={30} rx={2} fill={body} />
      <Rect x={15} y={22} width={18} height={5} rx={2} fill={body} />
      <Path d="M21 13 v7 M27 13 v7" fill="none" stroke={cut} />
      <Path d="M21 29 v7 M27 29 v7" fill="none" stroke={cut} />
    </>
  ),
  // Cylindrical oat canister with lid and label bands.
  oatcanister: ({ body, cut }) => (
    <>
      <Rect x={16} y={12} width={16} height={28} rx={4} fill={body} />
      <Path d="M16 18 h16" fill="none" stroke={cut} />
      <Path d="M16 33 h16" fill="none" stroke={cut} />
      <Circle cx={24} cy={26} r={3.5} fill="none" stroke={cut} />
    </>
  ),
  // Tomato can — double rim (cans have two), label circle + tiny leaf (natural: it IS a tomato).
  tomatocan: ({ body, cut, leaf }) => (
    <>
      <Rect x={16} y={14} width={16} height={24} rx={2} fill={body} />
      <Path d="M16 17.5 h16 M16 36 h16" fill="none" stroke={cut} />
      <Circle cx={24} cy={27} r={3.5} fill={cut} />
      <Path d="M24 23 C26 20 29 21 29 21 C29 23 27 24 25 23.5 Z" fill={leaf} />
    </>
  ),
  // Bean can — tilted open lid + double bottom rim + two bean dots.
  beancan: ({ body, cut }) => (
    <>
      <Rect x={16} y={16} width={16} height={22} rx={2} fill={body} />
      <Path d="M16 15 L32 11" fill="none" stroke={body} />
      <Path d="M16 36 h16" fill="none" stroke={cut} />
      <Ellipse cx={21} cy={26} rx={2.6} ry={1.9} fill={cut} />
      <Ellipse cx={27} cy={29} rx={2.6} ry={1.9} fill={cut} />
    </>
  ),
  // Squat, wide gable-top stock carton with a steam curl on the label.
  stockcarton: ({ body, cut }) => (
    <>
      <Path d="M13 24 h22 v14 q0 2 -2 2 H15 q-2 0 -2 -2 Z" fill={body} />
      <Path d="M13 24 L17 16 h14 l4 8 Z" fill={body} />
      <Path d="M24 16 v4" fill="none" stroke={cut} />
      <Path d="M21 32 q2 -3 0 -5 M27 32 q2 -3 0 -5" fill="none" stroke={cut} />
    </>
  ),
  // Waisted pepper grinder with a crank arm.
  peppergrinder: ({ body, cut }) => (
    <>
      <Path d="M18 40 q-2 -11 3 -17 q-3 -3 -3 -7 h12 q0 4 -3 7 q5 6 3 17 Z" fill={body} />
      <Circle cx={24} cy={12} r={2.5} fill={body} />
      <Path d="M26 12 h6" fill="none" stroke={body} />
      <Path d="M20 32 h8" fill="none" stroke={cut} />
    </>
  ),
  // Tumbler with a wave line.
  waterglass: ({ body, cut }) => (
    <>
      <Path d="M17 13 h14 l-2 25 q0 2 -2 2 h-6 q-2 0 -2 -2 Z" fill={body} />
      <Path d="M19 22 q2.5 -2 5 0 t5 0" fill="none" stroke={cut} />
    </>
  ),
  // Tall sparkling bottle with rising bubbles.
  fizzybottle: ({ body, cut }) => (
    <>
      <Path d="M21 10 h6 v6 q4 3 4 8 v13 q0 3 -3 3 h-8 q-3 0 -3 -3 V24 q0 -5 4 -8 Z" fill={body} />
      <Circle cx={22} cy={33} r={1.3} fill={cut} />
      <Circle cx={26} cy={29} r={1.3} fill={cut} />
      <Circle cx={23} cy={25} r={1.1} fill={cut} />
    </>
  ),
  // Juice carton with a fruit-circle label and a straw.
  juicecarton: ({ body, cut }) => (
    <>
      <Path d="M16 20 h16 v18 q0 2 -2 2 H18 q-2 0 -2 -2 Z" fill={body} />
      <Path d="M16 20 L20 12 h8 l4 8 Z" fill={body} />
      <Path d="M28 12 l4 -5" fill="none" stroke={body} />
      <Circle cx={24} cy={29} r={4} fill={cut} />
    </>
  ),
  // Mug with a handle and steam curls (exterior marks use body).
  coffeemug: ({ body, cut }) => (
    <>
      <Rect x={14} y={20} width={16} height={17} rx={3} fill={body} />
      <Path d="M30 24 q6 1 4 8 q-1 3 -4 2" fill="none" stroke={body} />
      <Path d="M19 16 q2 -3 0 -6 M25 16 q2 -3 0 -6" fill="none" stroke={body} />
      <Path d="M18 27 h8" fill="none" stroke={cut} />
    </>
  ),
  // Teacup on a saucer, tag string over the rim (leaf-green tag: natural).
  teacup: ({ body, cut, leaf }) => (
    <>
      <Path d="M14 22 h18 v5 q0 8 -9 8 q-9 0 -9 -8 Z" fill={body} />
      <Path d="M32 24 q5 1 3 6 q-1 2 -3 1.5" fill="none" stroke={body} />
      <Ellipse cx={23} cy={38} rx={11} ry={2} fill={body} />
      <Path d="M30 22 l4 -7" fill="none" stroke={body} />
      <Rect x={32.5} y={10} width={5} height={5} rx={1} fill={leaf} />
      <Path d="M17 26 h8" fill="none" stroke={cut} />
    </>
  ),
  // Necked soda can — tapered top rim, slim body, pull tab and a swoosh.
  sodacan: ({ body, cut }) => (
    <>
      <Path d="M18 18 Q18 14 21 14 H27 Q30 14 30 18 V37 Q30 40 27 40 H21 Q18 40 18 37 Z" fill={body} />
      <Path d="M19.5 20 h9" fill="none" stroke={cut} />
      <Circle cx={22} cy={16} r={1} fill={cut} />
      <Path d="M20.5 35 q5.5 -7 7 -11" fill="none" stroke={cut} />
    </>
  ),
  // Bulging round milk jug with a cap, side handle, and label band.
  milkjug: ({ body, cut }) => (
    <>
      <Path d="M19 14 h10 v5 l4 7 q3 5 3 10 q0 4 -4 4 H16 q-4 0 -4 -4 q0 -5 3 -10 l4 -7 Z" fill={body} />
      <Rect x={20} y={10} width={8} height={4} rx={1} fill={body} />
      <Path d="M33 25 q5 3 2 9" fill="none" stroke={body} />
      <Path d="M15 31 h18" fill="none" stroke={cut} />
    </>
  ),
  // Covered butter dish: base, dome, knob, pat line.
  butterdish: ({ body, cut }) => (
    <>
      <Path d="M13 34 h22 l-2 4 H15 Z" fill={body} />
      <Path d="M16 34 q0 -12 8 -12 q8 0 8 12 Z" fill={body} />
      <Circle cx={24} cy={19} r={2} fill={body} />
      <Path d="M19 30 h6" fill="none" stroke={cut} />
    </>
  ),
  // Wheat sheaf — stalk + grain ellipses, awn ticks.
  wheat: ({ body, cut }) => (
    <>
      <Path d="M24 42 V14" fill="none" stroke={body} />
      <Ellipse cx={24} cy={12} rx={2.6} ry={5} fill={body} />
      <Ellipse cx={19} cy={17} rx={2.4} ry={4.6} fill={body} />
      <Ellipse cx={29} cy={17} rx={2.4} ry={4.6} fill={body} />
      <Ellipse cx={19.5} cy={24} rx={2.4} ry={4.6} fill={body} />
      <Ellipse cx={28.5} cy={24} rx={2.4} ry={4.6} fill={body} />
      <Path d="M19 16 v3 M29 16 v3" fill="none" stroke={cut} />
    </>
  ),
  // Peanut — waisted shell with dimple cross-marks.
  peanut: ({ body, cut }) => (
    <>
      <Path d="M24 10 q7 0 7 7 q0 4 -3 5 q3 2 3 6 q0 8 -7 8 q-7 0 -7 -8 q0 -4 3 -6 q-3 -1 -3 -5 q0 -7 7 -7 Z" fill={body} />
      <Path d="M20 16 l3 3 M25 15 l3 3" fill="none" stroke={cut} />
      <Path d="M20 29 l3 3 M25 28 l3 3" fill="none" stroke={cut} />
    </>
  ),
  // Shrimp — curled body, segment lines, tail fan, eye dot.
  shrimp: ({ body, cut }) => (
    <>
      <Path d="M30 12 C38 16 38 28 30 32 C24 35 16 33 14 28 C19 31 25 30 27 26 C21 26 18 22 20 17 C22 13 27 11 30 12 Z" fill={body} />
      <Path d="M14 28 l-3 6 l7 -1 Z" fill={body} />
      <Path d="M28 15 q4 6 0 13" fill="none" stroke={cut} />
      <Path d="M24 16 q3 5 0 10" fill="none" stroke={cut} />
      <Circle cx={32} cy={16} r={1.4} fill={cut} />
    </>
  ),
  // ---- appliances (cook-device tiles) — no leaf, ever ----------------------
  // Frying pan: top-down disc + long handle, sizzle ticks inside.
  stove: ({ body, cut }) => (
    <>
      <Circle cx={20} cy={28} r={10} fill={body} />
      <Path d="M29 24 L40 19" fill="none" stroke={body} />
      <Path d="M17 26 l2 -3 M23 26 l2 -3" fill="none" stroke={cut} />
    </>
  ),
  // Oven: portrait box, door window outline, handle bar.
  oven: ({ body, cut }) => (
    <>
      <Rect x={13} y={12} width={22} height={28} rx={3} fill={body} />
      <Rect x={17} y={22} width={14} height={12} rx={2} fill="none" stroke={cut} />
      <Path d="M17 17 h14" fill="none" stroke={cut} />
    </>
  ),
  // Crockpot: squat pot, domed lid + knob, side handles, rim seam.
  crockpot: ({ body, cut }) => (
    <>
      <Path d="M13 20 h22 v11 q0 9 -11 9 q-11 0 -11 -9 Z" fill={body} />
      <Path d="M15 20 q0 -5 9 -5 q9 0 9 5 Z" fill={body} />
      <Circle cx={24} cy={12.5} r={2} fill={body} />
      <Path d="M13 24 h-3 M35 24 h3" fill="none" stroke={body} />
      <Path d="M15 20 h18" fill="none" stroke={cut} />
    </>
  ),
  // Air fryer: tall rounded body, vent lines, drawer seam + handle slot.
  airfryer: ({ body, cut }) => (
    <>
      <Rect x={15} y={10} width={18} height={30} rx={6} fill={body} />
      <Path d="M20 15 h8" fill="none" stroke={cut} />
      <Path d="M15 26 h18" fill="none" stroke={cut} />
      <Path d="M20 32 h8" fill="none" stroke={cut} />
    </>
  ),
  // Kettle grill: dome + bowl, splayed legs, lid handle, vent dot.
  grill: ({ body, cut }) => (
    <>
      <Path d="M12 24 q0 -11 12 -11 q12 0 12 11 Z" fill={body} />
      <Path d="M12 26 h24 q0 9 -12 9 q-12 0 -12 -9 Z" fill={body} />
      <Path d="M24 13 v-3" fill="none" stroke={body} />
      <Path d="M18 34 l-4 7 M30 34 l4 7" fill="none" stroke={body} />
      <Circle cx={24} cy={19} r={1.5} fill={cut} />
    </>
  ),
  // Griddle: flat plate, side handle nubs, steam curls (exterior = body).
  griddle: ({ body, cut }) => (
    <>
      <Rect x={11} y={26} width={26} height={7} rx={3} fill={body} />
      <Path d="M11 29 h-3 M37 29 h3" fill="none" stroke={body} />
      <Path d="M19 22 q2 -3 0 -6 M27 22 q2 -3 0 -6" fill="none" stroke={body} />
      <Path d="M15 29.5 h18" fill="none" stroke={cut} />
    </>
  ),
  // Instant Pot: straight cylinder, flat lid, steam valve, side handles, panel.
  instantpot: ({ body, cut }) => (
    <>
      <Rect x={14} y={16} width={20} height={22} rx={3} fill={body} />
      <Rect x={13} y={12.5} width={22} height={5} rx={2} fill={body} />
      <Rect x={22.5} y={8.5} width={3} height={4} rx={1} fill={body} />
      <Path d="M14 22 h-3.5 M34 22 h3.5" fill="none" stroke={body} />
      <Circle cx={24} cy={28} r={3} fill="none" stroke={cut} />
      <Circle cx={24} cy={34} r={1.2} fill={cut} />
    </>
  ),
  // Sheet pan: rimmed tray, inner outline, two cookie dots.
  sheetpan: ({ body, cut }) => (
    <>
      <Rect x={10} y={20} width={28} height={14} rx={4} fill={body} />
      <Rect x={14} y={23} width={20} height={8} rx={2} fill="none" stroke={cut} />
      <Circle cx={20} cy={27} r={1.5} fill={cut} />
      <Circle cx={27} cy={27} r={1.5} fill={cut} />
    </>
  ),
  // Microwave: landscape box, window outline, door seam, button dot.
  microwave: ({ body, cut }) => (
    <>
      <Rect x={10} y={17} width={28} height={17} rx={3} fill={body} />
      <Rect x={14} y={21} width={13} height={9} rx={1.5} fill="none" stroke={cut} />
      <Path d="M30 21 v9" fill="none" stroke={cut} />
      <Circle cx={33.5} cy={24} r={1.2} fill={cut} />
    </>
  ),
  // No-cook: cutting board (corner hole) with a knife laid across.
  nocook: ({ body, cut }) => (
    <>
      <Rect x={12} y={18} width={20} height={22} rx={4} fill={body} />
      <Path d="M18 34 L32 20 l3 3 L21 37 Z" fill={body} />
      <Path d="M32 20 l4 -4" fill="none" stroke={body} />
      <Circle cx={16} cy={22} r={1.6} fill={cut} />
    </>
  ),
};

/** Natural ground per pantry glyph — merged into BrandIcon's FOOD_TONE. */
export const PANTRY_TONE: Record<PantryFoodName, BrandTone> = {
  floursack: 'ochre', sugarbowl: 'blue', sugarbag: 'cocoa', sodabox: 'spruce',
  powdertin: 'terracotta', saltshaker: 'blue', yeastpacket: 'ochre',
  oliveoilbottle: 'olive', oiljug: 'ochre', soybottle: 'cocoa', ketchupbottle: 'brick',
  mustardbottle: 'ochre', mayojar: 'blue', hotsaucebottle: 'brick', vinegarflask: 'plum',
  honeypot: 'ochre',
  ricebowl: 'terracotta', spaghetti: 'ochre', oatcanister: 'cocoa', tomatocan: 'brick',
  beancan: 'cocoa', stockcarton: 'spruce', peppergrinder: 'cocoa',
  waterglass: 'blue', fizzybottle: 'spruce', juicecarton: 'terracotta', coffeemug: 'cocoa',
  teacup: 'fern', sodacan: 'plum', milkjug: 'blue', butterdish: 'ochre',
  wheat: 'ochre', peanut: 'cocoa', shrimp: 'brick',
  stove: 'spruce', oven: 'cocoa', crockpot: 'brick', airfryer: 'plum', grill: 'fern',
  griddle: 'ochre', instantpot: 'blue', sheetpan: 'terracotta', microwave: 'blue', nocook: 'cocoa',
} as const;
