import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

type Shape = { path: string } | { circle: [cx: number, cy: number, r: number] };

const path = (d: string): Shape => ({ path: d });
const circle = (cx: number, cy: number, r: number): Shape => ({ circle: [cx, cy, r] });

/** The template's icon set (`RiderTaxiAppTemplate/src/App.tsx`, `Icon`), 24×24 outlines; `check`, `close`, `alert`, `search`, `plus` and `globe` follow the same style. */
export const ICONS = {
  home: [path('m3 11 9-8 9 8'), path('M5 10v10h14V10M9 20v-6h6v6')],
  wallet: [path('M4 6.5h14a2 2 0 0 1 2 2V18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12'), path('M16 11h4v4h-4a2 2 0 0 1 0-4Z')],
  user: [circle(12, 8, 4), path('M4.5 21a7.5 7.5 0 0 1 15 0')],
  bell: [path('M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9'), path('M10 21h4')],
  menu: [path('M4 7h16M4 12h16M4 17h10')],
  navigation: [path('m4 4 16 6-7 3-3 7L4 4Z')],
  clock: [circle(12, 12, 9), path('M12 7v5l3 2')],
  route: [circle(6, 18, 2), circle(18, 6, 2), path('M8 18h2a4 4 0 0 0 4-4v-4a4 4 0 0 1 4-4')],
  arrow: [path('m9 18 6-6-6-6')],
  car: [path('m5 17-1 3M19 17l1 3M3 13l2-6h14l2 6v5H3v-5Z'), circle(7, 15, 1), circle(17, 15, 1), path('M5 11h14')],
  shield: [path('M12 3 5 6v5c0 4.5 2.9 8.6 7 10 4.1-1.4 7-5.5 7-10V6l-7-3Z'), path('m9 12 2 2 4-4')],
  help: [circle(12, 12, 9), path('M9.7 9a2.5 2.5 0 1 1 3.3 2.4c-.7.3-1 1-1 1.6M12 17h.01')],
  settings: [
    circle(12, 12, 3),
    path(
      'M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.6v.2h-4V21A1.8 1.8 0 0 0 8.8 19.4a1.8 1.8 0 0 0-2 .4l-.1.1-2.8-2.8.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 2.8 14h-.2v-4h.2A1.8 1.8 0 0 0 4.4 9a1.8 1.8 0 0 0-.4-2l-.1-.1 2.8-2.8.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 10 3v-.2h4V3a1.8 1.8 0 0 0 1.1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1L20 6.9l-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1h.2v4h-.2a1.8 1.8 0 0 0-1.7 1Z',
    ),
  ],
  chevronDown: [path('m7 10 5 5 5-5')],
  sun: [
    circle(12, 12, 4),
    path('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'),
  ],
  moon: [path('M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z')],
  check: [path('m5 12.5 4.5 4.5L19 7.5')],
  close: [path('M6 6l12 12M18 6 6 18')],
  alert: [path('M12 3 2.5 20h19L12 3Z'), path('M12 10v4.5M12 17.5h.01')],
  search: [circle(11, 11, 6.5), path('m20 20-4.2-4.2')],
  plus: [path('M12 5v14M5 12h14')],
  globe: [
    circle(12, 12, 9),
    path('M3 12h18M12 3c2.5 2.4 3.8 5.4 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.4-3.8-9S9.5 5.4 12 3Z'),
  ],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Width and height in dp. The template uses 20 (`h-5 w-5`) in most places. */
  size?: number;
  /** A colour from the theme; defaults to the theme's icon colour. */
  color?: string;
  /** Fill the shape with the colour (the template does this for the map's navigation arrow). */
  filled?: boolean;
}

/** Icons are decoration: the control or text next to them carries the accessible name. */
export function Icon({ name, size = 20, color, filled = false }: IconProps) {
  const { colors } = useTheme();
  const tint = color ?? colors.icon;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {ICONS[name].map((shape, index) =>
        'path' in shape ? (
          <Path
            key={index}
            d={shape.path}
            stroke={tint}
            fill={filled ? tint : 'none'}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <Circle
            key={index}
            cx={shape.circle[0]}
            cy={shape.circle[1]}
            r={shape.circle[2]}
            stroke={tint}
            fill={filled ? tint : 'none'}
            strokeWidth={1.8}
          />
        ),
      )}
    </Svg>
  );
}
