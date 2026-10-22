import { act, screen, userEvent, within } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { MapView, type MapMarker } from '../map/MapView';
import { UiProvider } from '../UiProvider';
import { brand } from '../theme/tokens.js';
import { renderUi, resetTheme } from './helpers';

const camera = jest.requireMock('@maplibre/maplibre-react-native').__camera as { flyTo: jest.Mock };
const YEREVAN = { lat: 40.1792, lng: 44.4991 };

afterEach(() => {
  resetTheme();
  camera.flyTo.mockClear();
});

const map = () => screen.getByTestId('Map');
const regionChanged = (center: [number, number], userInteraction: boolean) =>
  act(() => map().props.onRegionDidChange({ nativeEvent: { center, userInteraction } }));

/** Draws the map again with other props under the same provider (the theme and language are kept). */
const redraw = (view: Awaited<ReturnType<typeof renderMap>>, props: Partial<ComponentProps<typeof MapView>>) =>
  view.rerender(
    <UiProvider preferences={view.preferences}>
      <MapView center={YEREVAN} {...props} />
    </UiProvider>,
  );

async function renderMap(props: Partial<ComponentProps<typeof MapView>> = {}, saved: { theme?: string } = {}) {
  return renderUi(<MapView center={YEREVAN} {...props} />, { saved });
}

describe('MapView', () => {
  it('opens on the given centre and zoom, with the map labelled for screen readers', async () => {
    await renderMap({ zoom: 15 });

    expect(screen.getByLabelText('Map')).toBeOnTheScreen();
    expect(screen.getByTestId('Camera').props.initialViewState).toEqual({ center: [44.4991, 40.1792], zoom: 15 });
  });

  it('draws the light map in light mode and the dark one in dark mode', async () => {
    await renderMap({}, { theme: 'light' });
    const light = map().props.mapStyle.layers.find((layer: { id: string }) => layer.id === 'background');
    expect(light.paint['background-color']).toBe(brand.mapLight);

    resetTheme();
    screen.unmount();
    await renderMap({}, { theme: 'dark' });
    const dark = map().props.mapStyle.layers.find((layer: { id: string }) => layer.id === 'background');
    expect(dark.paint['background-color']).toBe(brand.mapDark);
  });

  it('uses the tile server it is given', async () => {
    await renderMap({ tileUrl: 'https://tiles.taxikosmos.am/{z}/{x}/{y}.png' });

    expect(map().props.mapStyle.sources.tiles.tiles).toEqual(['https://tiles.taxikosmos.am/{z}/{x}/{y}.png']);
  });

  describe('markers', () => {
    const markers: MapMarker[] = [
      { id: 'me', kind: 'rider', location: { lat: 40.18, lng: 44.5 }, label: 'You are here' },
      { id: 'car-1', kind: 'car', location: { lat: 40.19, lng: 44.51 }, label: 'Car 1' },
      { id: 'd', kind: 'driver', location: { lat: 40.2, lng: 44.52 }, heading: 90, label: 'Your driver' },
      { id: 'a', kind: 'pickup', location: { lat: 40.21, lng: 44.53 }, label: 'Pickup' },
      { id: 'b', kind: 'dropoff', location: { lat: 40.22, lng: 44.54 }, label: 'Drop-off' },
    ];

    it('puts each marker at its [lng, lat] with a spoken label', async () => {
      await renderMap({ markers });

      const annotations = screen.getAllByTestId('ViewAnnotation');
      expect(annotations.map((annotation) => annotation.props.lngLat)).toEqual([
        [44.5, 40.18],
        [44.51, 40.19],
        [44.52, 40.2],
        [44.53, 40.21],
        [44.54, 40.22],
      ]);
      for (const marker of markers) {
        expect(screen.getByLabelText(marker.label)).toBeOnTheScreen();
      }
    });

    it("turns the driver's arrow to its heading and leaves the rider's pointing up", async () => {
      await renderMap({ markers });

      expect(screen.getByLabelText('Your driver').props.style).toEqual(
        expect.objectContaining({ transform: [{ rotate: '90deg' }] }),
      );
      expect(screen.getByLabelText('You are here').props.style).toBeUndefined();
    });

    it('draws nothing for an empty list', async () => {
      await renderMap();

      expect(screen.queryAllByTestId('ViewAnnotation')).toHaveLength(0);
    });
  });

  describe('route line', () => {
    it('draws the route as a line from [lng, lat] points', async () => {
      await renderMap({
        route: [
          { lat: 40.1836, lng: 44.5125 },
          { lat: 40.1846, lng: 44.5145 },
        ],
      });

      expect(screen.getByTestId('GeoJSONSource').props.data).toEqual({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [44.5125, 40.1836],
            [44.5145, 40.1846],
          ],
        },
      });
      expect(screen.getByTestId('Layer').props).toMatchObject({ type: 'line', source: 'route' });
    });

    it('uses a lime line in dark mode so it shows on the dark map, and an ink one in light mode', async () => {
      const route = [YEREVAN, { lat: 40.19, lng: 44.5 }];
      await renderMap({ route }, { theme: 'dark' });
      expect(screen.getByTestId('Layer').props.paint['line-color']).toBe(brand.accent);

      resetTheme();
      screen.unmount();
      await renderMap({ route }, { theme: 'light' });
      expect(screen.getByTestId('Layer').props.paint['line-color']).toBe(brand.ink);
    });

    it.each([
      ['no route', undefined],
      ['an empty route', []],
      ['a single point', [YEREVAN]],
    ])('draws no line for %s', async (_, route) => {
      await renderMap({ route });

      expect(screen.queryByTestId('GeoJSONSource')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('Layer')).not.toBeOnTheScreen();
    });
  });

  describe('camera', () => {
    it('flies to a new centre', async () => {
      const view = await renderMap();

      redraw(view, { center: { lat: 40.2, lng: 44.55 }, zoom: 16 });

      expect(camera.flyTo).toHaveBeenCalledWith({ center: [44.55, 40.2], zoom: 16, duration: 600 });
    });

    it('does not fly when the centre is only the place the person panned to', async () => {
      const view = await renderMap();
      await regionChanged([44.6, 40.25], true);

      redraw(view, { center: { lat: 40.25, lng: 44.6 } });

      expect(camera.flyTo).not.toHaveBeenCalled();
    });

    it('does not fly on the first draw', async () => {
      await renderMap();

      expect(camera.flyTo).not.toHaveBeenCalled();
    });
  });

  describe('moving the map by hand', () => {
    it('reports where the person left it', async () => {
      const onCenterChange = jest.fn();
      await renderMap({ onCenterChange });

      await regionChanged([44.6, 40.25], true);

      expect(onCenterChange).toHaveBeenCalledTimes(1);
      expect(onCenterChange).toHaveBeenCalledWith({ lat: 40.25, lng: 44.6 });
    });

    it('stays quiet about moves the screen made itself', async () => {
      const onCenterChange = jest.fn();
      await renderMap({ onCenterChange });

      await regionChanged([44.6, 40.25], false);

      expect(onCenterChange).not.toHaveBeenCalled();
    });

    it('shows the pin in the middle when asked, labelled, and not in the way of touches', async () => {
      await renderMap({ centerPin: { kind: 'pickup', label: 'Selected point' } });

      const pin = screen.getByLabelText('Selected point');
      expect(pin).toBeOnTheScreen();
      // The pin sits in a layer over the map that lets every touch through to it.
      let layer = pin.parent;
      while (layer && layer.props.pointerEvents === undefined) {
        layer = layer.parent;
      }
      expect(layer?.props.pointerEvents).toBe('none');
    });

    it('has no pin by default', async () => {
      await renderMap();

      expect(screen.queryByLabelText('Selected point')).not.toBeOnTheScreen();
    });
  });

  describe('my location button', () => {
    it('is there only when the screen can act on it, and presses through', async () => {
      const user = userEvent.setup();
      const onLocate = jest.fn();
      const view = await renderMap();
      expect(screen.queryByRole('button', { name: 'Show my location' })).not.toBeOnTheScreen();

      redraw(view, { onLocate });
      await user.press(screen.getByRole('button', { name: 'Show my location' }));

      expect(onLocate).toHaveBeenCalledTimes(1);
    });

    it("is named in the person's language", async () => {
      await renderUi(<MapView center={YEREVAN} onLocate={jest.fn()} />, { saved: { locale: 'ru' } });

      expect(
        within(screen.getByLabelText('Карта')).getByRole('button', { name: 'Показать моё местоположение' }),
      ).toBeOnTheScreen();
    });
  });
});
