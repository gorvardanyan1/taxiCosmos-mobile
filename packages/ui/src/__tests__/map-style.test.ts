import { brand } from '../theme/tokens.js';
import { buildMapStyle, OSM_ATTRIBUTION, OSM_TILE_URL } from '../map/style';

const tileLayer = (scheme: 'light' | 'dark') => buildMapStyle(scheme).layers.find((layer) => layer.id === 'tiles');
const background = (scheme: 'light' | 'dark') =>
  buildMapStyle(scheme).layers.find((layer) => layer.id === 'background');

describe('buildMapStyle', () => {
  it('draws OpenStreetMap raster tiles with their attribution by default', () => {
    expect(buildMapStyle('light').sources.tiles).toMatchObject({
      type: 'raster',
      tiles: [OSM_TILE_URL],
      tileSize: 256,
      attribution: OSM_ATTRIBUTION,
    });
  });

  it('uses the tile server the build was given instead', () => {
    expect(buildMapStyle('dark', 'https://tiles.taxikosmos.am/{z}/{x}/{y}.png').sources.tiles).toMatchObject({
      tiles: ['https://tiles.taxikosmos.am/{z}/{x}/{y}.png'],
    });
  });

  it("sits on the template's map grey in each theme", () => {
    expect(background('light')).toMatchObject({ paint: { 'background-color': brand.mapLight } });
    expect(background('dark')).toMatchObject({ paint: { 'background-color': brand.mapDark } });
  });

  it('dims and desaturates the tiles in dark mode only', () => {
    expect(tileLayer('dark')).toMatchObject({
      paint: { 'raster-brightness-max': expect.any(Number), 'raster-saturation': expect.any(Number) },
    });
    expect(
      (tileLayer('dark') as unknown as { paint: Record<string, number> }).paint['raster-brightness-max'],
    ).toBeLessThan(0.6);
    expect(tileLayer('light')).not.toHaveProperty('paint.raster-brightness-max');
  });
});
