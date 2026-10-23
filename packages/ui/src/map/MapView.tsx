import { Camera, GeoJSONSource, Layer, Map, ViewAnnotation, type CameraRef } from '@maplibre/maplibre-react-native';
import { DEFAULT_MAP_ZOOM, type LatLng } from '@taxikosmos/core';
import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';

import { IconButton } from '../components/IconButton';
import { cx } from '../components/cx';
import { useUiTranslation } from '../i18n/hooks';
import { Icon } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { brand } from '../theme/tokens.js';
import { buildMapStyle } from './style';

/** The markers of the template's map: the rider's arrow, a car, the driver's arrow (turns with the heading), and the two trip ends. */
export type MarkerKind = 'rider' | 'car' | 'driver' | 'pickup' | 'dropoff';

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  location: LatLng;
  /** Degrees clockwise from north; turns a `driver` arrow. */
  heading?: number;
  /** What a screen reader says for it. Translated by the screen. */
  label: string;
}

export interface MapViewProps {
  /** Where the map looks. Change it to move the camera; panning by hand reports through `onCenterChange` instead. */
  center: LatLng;
  zoom?: number;
  markers?: readonly MapMarker[];
  /** A line to draw (the route from `/geo/route`, decoded). Fewer than two points draws nothing. */
  route?: readonly LatLng[];
  /** A pin fixed in the middle while the map moves under it: pick a spot by dragging the map, then read it from `onCenterChange`. */
  centerPin?: { kind: 'pickup' | 'dropoff'; label: string };
  /** The person moved the map by hand and let go. Not called for moves the screen asked for. */
  onCenterChange?: (center: LatLng) => void;
  /** Shows the "my location" button. */
  onLocate?: () => void;
  /** Tile server template; defaults to OpenStreetMap's public one (development only). */
  tileUrl?: string;
  className?: string;
}

const lngLat = ({ lat, lng }: LatLng): [number, number] => [lng, lat];

/** About a metre. Closer than this is the same place. */
const SAME_PLACE = 0.00001;

/**
 * The shared map: OpenStreetMap tiles drawn by MapLibre in the app's light or dark look, the template's markers, a route line, a centre pin for
 * picking a spot and a "my location" button. It holds no location or network logic: screens pass what to show and read where the person moved it.
 */
export function MapView({
  center,
  zoom = DEFAULT_MAP_ZOOM,
  markers = [],
  route,
  centerPin,
  onCenterChange,
  onLocate,
  tileUrl,
  className,
}: MapViewProps) {
  const { t } = useUiTranslation();
  const { scheme, colors } = useTheme();
  const camera = useRef<CameraRef | null>(null);
  // Where the camera is now (set when the map settles), so a `center` that only echoes the person's own pan does not move it again.
  const looking = useRef<LatLng>(center);
  const style = useMemo(() => buildMapStyle(scheme, tileUrl), [scheme, tileUrl]);
  const line = useMemo(
    () =>
      route && route.length >= 2
        ? ({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: route.map(lngLat) },
          } as const)
        : null,
    [route],
  );

  useEffect(() => {
    if (
      Math.abs(looking.current.lat - center.lat) > SAME_PLACE ||
      Math.abs(looking.current.lng - center.lng) > SAME_PLACE
    ) {
      looking.current = center;
      camera.current?.flyTo({ center: lngLat(center), zoom, duration: 600 });
    }
  }, [center, zoom]);

  return (
    <View
      className={cx('flex-1 overflow-hidden bg-map-light dark:bg-map-dark', className)}
      accessibilityLabel={t('map.label')}
    >
      <Map
        style={{ flex: 1 }}
        mapStyle={style}
        logo={false}
        compass={false}
        onRegionDidChange={(event) => {
          const { center: next, userInteraction } = event.nativeEvent;
          const point = { lat: next[1], lng: next[0] };
          looking.current = point;

          if (userInteraction) {
            onCenterChange?.(point);
          }
        }}
      >
        <Camera ref={camera} initialViewState={{ center: lngLat(center), zoom }} />
        {line ? (
          <>
            <GeoJSONSource id="route" data={line} />
            <Layer
              id="route-line"
              type="line"
              source="route"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': scheme === 'dark' ? brand.accent : brand.ink, 'line-width': 5 }}
            />
          </>
        ) : null}
        {markers.map((marker) => (
          <ViewAnnotation key={marker.id} id={marker.id} lngLat={lngLat(marker.location)} anchor="center">
            <Marker marker={marker} />
          </ViewAnnotation>
        ))}
      </Map>
      {centerPin ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View accessibilityLabel={centerPin.label} className="mb-9">
            <Icon name="pin" size={40} color={centerPin.kind === 'pickup' ? colors.icon : colors.danger} filled />
          </View>
        </View>
      ) : null}
      {onLocate ? (
        <View className="absolute bottom-4 right-4">
          <IconButton icon="locate" label={t('map.locate')} onPress={onLocate} />
        </View>
      ) : null}
    </View>
  );
}

function Marker({ marker }: { marker: MapMarker }) {
  const { colors } = useTheme();

  if (marker.kind === 'rider' || marker.kind === 'driver') {
    return (
      <View
        accessibilityLabel={marker.label}
        style={marker.kind === 'driver' ? { transform: [{ rotate: `${marker.heading ?? 0}deg` }] } : undefined}
        className="h-11 w-11 items-center justify-center rounded-full border-4 border-white/70 bg-slate-950 shadow-xl"
      >
        <Icon name="navigation" size={20} color="#FFFFFF" filled />
      </View>
    );
  }

  if (marker.kind === 'car') {
    return (
      <View
        accessibilityLabel={marker.label}
        className="h-8 w-8 items-center justify-center rounded-full border-[3px] border-white bg-accent shadow-lg"
      >
        <Icon name="car" size={16} color={colors.onAccent} />
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={marker.label}
      className={cx(
        'h-8 w-8 items-center justify-center rounded-full border-[3px] border-white shadow-lg',
        marker.kind === 'pickup' ? 'bg-accent' : 'bg-slate-950',
      )}
    >
      <Icon name="pin" size={16} color={marker.kind === 'pickup' ? colors.onAccent : '#FFFFFF'} />
    </View>
  );
}
