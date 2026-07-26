// One icon family for the whole app.
//
// Recommendations and the packing list used to render emoji sent straight from
// the API (⛔ 😷 🌫️ 🧥 …), while the hero and the tab bar used lucide SVGs. Two
// icon families in one interface, and the emoji half could not be themed,
// sized on the type scale, or trusted to look the same twice — a platform font
// decides how they draw, so the same recommendation looked different on iOS,
// Android and Windows.
//
// The API now sends a key and this component owns the glyph, which also means
// a designer can restyle every icon in the product from one file.

import {
  Baby,
  Ban,
  CloudRain,
  Cloudy,
  Construction,
  Droplets,
  Flame,
  Flower2,
  Footprints,
  Glasses,
  Hand,
  Leaf,
  type LucideIcon,
  type LucideProps,
  Shirt,
  Smile,
  Snowflake,
  SprayCan,
  Sun,
  Thermometer,
  ThermometerSnowflake,
  Umbrella,
  Wind,
  Car,
  HardHat,
  Activity,
} from 'lucide-react';

export type IconKey =
  // sent by the backend recommendation engine
  | 'stay-home'
  | 'mask'
  | 'haze'
  | 'clean-air'
  | 'heat'
  | 'sun'
  | 'water'
  | 'cold'
  | 'scarf'
  | 'coat'
  | 'ice'
  | 'rain'
  | 'umbrella'
  | 'wind'
  | 'wind-strong'
  | 'sunglasses'
  | 'sunscreen'
  | 'pollen'
  | 'smoke'
  | 'construction'
  | 'traffic'
  // client-side packing list
  | 'allergy'
  | 'cap'
  | 'boots'
  | 'gloves'
  | 'baby'
  | 'exercise'
  | 'nothing';

// Stroke weight and corner style are consistent across the set because they
// all come from one library — the thing a mixed emoji/SVG set can never give.
const ICONS: Record<IconKey, LucideIcon> = {
  'stay-home': Ban,
  mask: Hand,
  haze: Cloudy,
  'clean-air': Leaf,
  heat: Thermometer,
  sun: Sun,
  water: Droplets,
  cold: ThermometerSnowflake,
  scarf: Shirt,
  coat: Shirt,
  ice: Snowflake,
  rain: CloudRain,
  umbrella: Umbrella,
  wind: Wind,
  'wind-strong': Wind,
  sunglasses: Glasses,
  sunscreen: SprayCan,
  pollen: Flower2,
  smoke: Flame,
  construction: Construction,
  traffic: Car,
  allergy: Flower2,
  cap: HardHat,
  boots: Footprints,
  gloves: Hand,
  baby: Baby,
  exercise: Activity,
  nothing: Smile,
};

interface RecIconProps extends Omit<LucideProps, 'ref'> {
  icon: string;
  size?: number;
}

/**
 * Renders the icon for a key. Unknown keys fall back to a neutral glyph rather
 * than an empty box, so a new rule shipped on the server can never leave a
 * hole in the layout before the client catches up.
 *
 * Always decorative: every recommendation prints its own title next to the
 * icon, so announcing the glyph would just repeat that title to a screen
 * reader.
 */
export function RecIcon({ icon, size = 16, className = '', ...rest }: RecIconProps) {
  const Glyph = ICONS[icon as IconKey] ?? Activity;
  return (
    <Glyph
      size={size}
      strokeWidth={1.75}
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      {...rest}
    />
  );
}
