import type { MapProps } from '@maplibre/maplibre-react-native';

import { brand } from '../theme/tokens.js';
import type { ThemeScheme } from '../theme/ThemeProvider';

export type MapStyle = Exclude<MapProps['mapStyle'], string>;

/** OpenStreetMap's public tile server: fine while developing, not for a launched app (its usage policy). Production sets `MAP_TILE_URL`. */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * The map's look in each theme, from one set of raster tiles (no paid or keyed style needed). The page colour behind the tiles is the
 * template's map grey (`mapLight` / `mapDark`); in dark mode the tiles are dimmed and desaturated so the map sits in the dark UI the way the
 * template's does.
 */
export function buildMapStyle(scheme: ThemeScheme, tileUrl: string = OSM_TILE_URL): MapStyle {
  const dark = scheme === 'dark';

  return {
    version: 8,
    sources: {
      tiles: { type: 'raster', tiles: [tileUrl], tileSize: 256, maxzoom: 19, attribution: OSM_ATTRIBUTION },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': dark ? brand.mapDark : brand.mapLight } },
      {
        id: 'tiles',
        type: 'raster',
        source: 'tiles',
        paint: dark
          ? { 'raster-brightness-max': 0.42, 'raster-saturation': -0.75, 'raster-contrast': 0.1 }
          : { 'raster-saturation': -0.25 },
      },
    ],
  };
}
