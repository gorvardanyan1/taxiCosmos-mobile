import { useGeoReverse, useGeoRoute } from '@taxikosmos/api-client';
import { AddressSearch, LocationPrompt, useForegroundLocation } from '@taxikosmos/app-shell';
import {
  addressAt,
  decodePolyline,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  midpoint,
  zoomToFit,
  type AddressPoint,
  type LatLng,
} from '@taxikosmos/core';
import { Button, Card, Icon, IconButton, MapView, Text, useUiTranslation, type MapMarker } from '@taxikosmos/ui';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appConfig } from '../config';
import { continueState, type ContinueReason } from './continueState';
import { useTripDraft } from './TripDraft';
import { useTripPlan } from './useTripPlan';

type Mode = 'overview' | 'pickup' | 'dropoff';

const PICKUP_ZOOM = 15;

/**
 * The rider's home: a map, where the ride starts and where it goes. The pickup is the phone's position unless the rider changes it; both
 * ends are chosen the same way, by searching an address or by moving the map under a pin. With both set, the route is priced: that answer
 * proves the pickup is served (otherwise "not available here"), and only then can the rider go on to the ride options.
 */
export function HomeScreen() {
  const { t } = useUiTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setDraft } = useTripDraft();
  const location = useForegroundLocation();
  const [mode, setMode] = useState<Mode>('overview');
  // Chosen by the rider; until then the pickup is where the phone is.
  const [chosenPickup, setChosenPickup] = useState<AddressPoint | null>(null);
  const [dropoff, setDropoff] = useState<AddressPoint | null>(null);
  // Picking: where the map is looking, and the spot under the pin once the rider lets go.
  const [pickCenter, setPickCenter] = useState<LatLng>(DEFAULT_MAP_CENTER);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [seenPosition, setSeenPosition] = useState<LatLng | null>(null);

  const deviceReverse = useGeoReverse(location.position);
  const devicePickup =
    location.position !== null && deviceReverse.data !== undefined
      ? addressAt(location.position, deviceReverse.data)
      : null;
  const pickup = chosenPickup ?? devicePickup;
  const plan = useTripPlan(pickup, dropoff);
  const pinReverse = useGeoReverse(mode === 'overview' ? null : pin);
  const route = useGeoRoute(plan.status === 'ready' ? pickup : null, plan.status === 'ready' ? dropoff : null);
  const routePoints = useMemo(() => pointsOf(route.data?.polyline), [route.data?.polyline]);

  // A new position from the phone while the rider is placing a pin moves the pin there (React's way of reacting to a changed input while rendering).
  if (location.position !== seenPosition) {
    setSeenPosition(location.position);

    if (location.position !== null && mode !== 'overview') {
      setPickCenter(location.position);
      setPin(location.position);
    }
  }

  const overview = overviewFocus(pickup, dropoff, location.position);
  const center = mode === 'overview' ? overview.center : pickCenter;
  const zoom = mode === 'overview' ? overview.zoom : PICKUP_ZOOM;
  const markers: MapMarker[] =
    mode !== 'overview'
      ? []
      : [
          ...(pickup
            ? [{ id: 'pickup', kind: 'pickup' as const, location: pickup, label: t('booking.markerPickup') }]
            : []),
          ...(dropoff
            ? [{ id: 'dropoff', kind: 'dropoff' as const, location: dropoff, label: t('booking.markerDropoff') }]
            : []),
        ];

  const startPicking = (kind: 'pickup' | 'dropoff') => {
    const start = kind === 'pickup' ? (pickup ?? overview.center) : (dropoff ?? pickup ?? overview.center);
    setMode(kind);
    setPickCenter(start);
    setPin(start);
  };

  const place = (kind: 'pickup' | 'dropoff', point: AddressPoint) => {
    if (kind === 'pickup') {
      setChosenPickup(point);
    } else {
      setDropoff(point);
    }

    setMode('overview');
  };

  const confirmPin = () => {
    if (mode !== 'overview' && pin !== null && pinReverse.data !== undefined) {
      place(mode, addressAt(pin, pinReverse.data));
    }
  };

  const locate = async () => {
    if (location.permission !== 'granted') {
      setPromptDismissed(false);

      return;
    }

    if (mode === 'overview') {
      // Back to following the phone.
      setChosenPickup(null);
    }

    await location.locate();
  };

  const goOn = async () => {
    if (pickup === null || dropoff === null) {
      return;
    }

    try {
      const quote = await plan.freshQuote();
      setDraft({ pickup, dropoff, quote });
      router.push('/ride-options');
    } catch {
      // The failure is on screen (the plan's status), with its own retry.
    }
  };

  const prompt =
    location.permission === 'undetermined' || location.permission === 'denied' || location.permission === 'blocked'
      ? location.permission
      : null;

  return (
    <View className="flex-1 bg-paper dark:bg-slate-950">
      <MapView
        center={center}
        zoom={zoom}
        markers={markers}
        route={mode === 'overview' ? routePoints : []}
        onLocate={() => void locate()}
        {...(mode === 'overview'
          ? {}
          : {
              centerPin: {
                kind: mode === 'pickup' ? ('pickup' as const) : ('dropoff' as const),
                label: mode === 'pickup' ? t('booking.pinPickup') : t('booking.pinDropoff'),
              },
              onCenterChange: (next: LatLng) => {
                setPickCenter(next);
                setPin(next);
              },
            })}
        {...(appConfig.mapTileUrl ? { tileUrl: appConfig.mapTileUrl } : {})}
      />
      {mode === 'overview' && appConfig.environment !== 'production' ? <DevLinks top={insets.top + 12} /> : null}
      {mode !== 'overview' ? (
        <View className="absolute left-4 right-4 flex-row items-start gap-2" style={{ top: insets.top + 12 }}>
          <View className="flex-1">
            <AddressSearch
              near={location.position}
              label={mode === 'pickup' ? t('booking.pickup') : t('booking.dropoff')}
              placeholder={mode === 'pickup' ? t('booking.searchPickup') : t('booking.searchDropoff')}
              onSelect={(point) => place(mode, point)}
            />
          </View>
          <IconButton icon="close" label={t('booking.back')} onPress={() => setMode('overview')} className="mt-7" />
        </View>
      ) : null}
      <View className="absolute left-4 right-4 gap-3" style={{ bottom: insets.bottom + 16 }}>
        {mode === 'overview' ? (
          <>
            {prompt !== null && !promptDismissed && chosenPickup === null ? (
              <LocationPrompt
                kind={prompt}
                onAllow={location.request}
                onOpenSettings={() => Linking.openSettings()}
                onDismiss={() => setPromptDismissed(true)}
              />
            ) : null}
            <Card>
              <View className="gap-4">
                <PickupRow
                  pickup={pickup}
                  finding={
                    pickup === null &&
                    (location.permission === 'checking' ||
                      location.locating ||
                      (location.position !== null && deviceReverse.isFetching))
                  }
                  failed={pickup === null && location.position !== null && deviceReverse.isError}
                  onRetry={() => void deviceReverse.refetch()}
                  onChange={() => startPicking('pickup')}
                />
                <DropoffRow dropoff={dropoff} onChange={() => startPicking('dropoff')} />
                <PlanNotice status={plan.status} onRetry={plan.retry} />
                <ContinueButton
                  state={continueState({ pickup, dropoff, locating: location.locating, plan: plan.status })}
                  onPress={goOn}
                />
              </View>
            </Card>
          </>
        ) : (
          <Card>
            <View className="gap-3">
              <Text
                accessibilityRole="header"
                className="text-base font-manrope-extrabold text-slate-950 dark:text-white"
              >
                {mode === 'pickup' ? t('booking.pickPickupTitle') : t('booking.pickDropoffTitle')}
              </Text>
              <PinAddress
                failed={pinReverse.isError}
                address={pinReverse.data?.address ?? null}
                onRetry={() => void pinReverse.refetch()}
              />
              <Button
                fullWidth
                variant="primary"
                label={mode === 'pickup' ? t('booking.confirmPickup') : t('booking.confirmDropoff')}
                disabled={pinReverse.data === undefined}
                onPress={confirmPin}
              />
            </View>
          </Card>
        )}
      </View>
    </View>
  );
}

/** Development and staging builds only: the way to the design-system preview and the map tool. */
function DevLinks({ top }: { top: number }) {
  const { t } = useUiTranslation();
  const router = useRouter();

  return (
    <View className="absolute left-4 flex-row gap-2" style={{ top }}>
      <Button size="sm" variant="ghost" label={t('preview.title')} onPress={() => router.push('/design-preview')} />
      <Button
        size="sm"
        variant="ghost"
        label={t('location.previewTitle')}
        onPress={() => router.push('/map-preview')}
      />
    </View>
  );
}

function pointsOf(polyline: string | undefined): LatLng[] {
  if (polyline === undefined) {
    return [];
  }

  try {
    return decodePolyline(polyline);
  } catch {
    // A line that cannot be read is left off the map: the rider can still book.
    return [];
  }
}

function overviewFocus(
  pickup: AddressPoint | null,
  dropoff: AddressPoint | null,
  position: LatLng | null,
): { center: LatLng; zoom: number } {
  if (pickup !== null && dropoff !== null) {
    return { center: midpoint(pickup, dropoff), zoom: zoomToFit(pickup, dropoff) };
  }

  if (pickup !== null) {
    return { center: pickup, zoom: PICKUP_ZOOM };
  }

  return { center: position ?? DEFAULT_MAP_CENTER, zoom: position === null ? DEFAULT_MAP_ZOOM : PICKUP_ZOOM };
}

function PickupRow({
  pickup,
  finding,
  failed,
  onRetry,
  onChange,
}: {
  pickup: AddressPoint | null;
  finding: boolean;
  failed: boolean;
  onRetry: () => void;
  onChange: () => void;
}) {
  const { t } = useUiTranslation();

  return (
    <View className="flex-row items-center gap-3">
      <View className="h-3 w-3 rounded-full bg-accent" />
      <View className="flex-1">
        <Text className="text-xs font-manrope-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {t('booking.pickup')}
        </Text>
        {pickup !== null ? (
          <Text numberOfLines={2} className="text-sm font-manrope-bold text-slate-950 dark:text-white">
            {pickup.address}
          </Text>
        ) : finding ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-slate-500 dark:text-slate-400">
            {t('booking.findingYou')}
          </Text>
        ) : failed ? (
          <Text accessibilityRole="alert" className="text-sm text-red-600 dark:text-red-500">
            {t('location.addressFailed')}
          </Text>
        ) : null}
      </View>
      {pickup !== null ? (
        <Button size="sm" variant="ghost" label={t('booking.change')} onPress={onChange} />
      ) : failed ? (
        <Button size="sm" variant="ghost" label={t('common.retry')} onPress={onRetry} />
      ) : !finding ? (
        <Button size="sm" variant="primary" label={t('booking.setPickup')} onPress={onChange} />
      ) : null}
    </View>
  );
}

function DropoffRow({ dropoff, onChange }: { dropoff: AddressPoint | null; onChange: () => void }) {
  const { t } = useUiTranslation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        dropoff === null
          ? `${t('booking.dropoff')}: ${t('booking.whereTo')}`
          : `${t('booking.dropoff')}: ${dropoff.address}`
      }
      accessibilityHint={t('booking.change')}
      onPress={onChange}
      className="min-h-[56px] flex-row items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 active:opacity-70 dark:bg-slate-800"
    >
      <Icon name="search" size={18} />
      <View className="flex-1">
        {dropoff === null ? (
          <Text className="text-base font-manrope-bold text-slate-950 dark:text-white">{t('booking.whereTo')}</Text>
        ) : (
          <>
            <Text className="text-xs font-manrope-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {t('booking.dropoff')}
            </Text>
            <Text numberOfLines={2} className="text-sm font-manrope-bold text-slate-950 dark:text-white">
              {dropoff.address}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

function PlanNotice({ status, onRetry }: { status: string; onRetry: () => void }) {
  const { t } = useUiTranslation();

  if (status === 'outside') {
    return (
      <View accessibilityRole="alert" className="gap-1 rounded-2xl bg-red-50 p-4 dark:bg-red-950">
        <Text className="text-sm font-manrope-extrabold text-red-700 dark:text-red-400">
          {t('booking.notAvailableTitle')}
        </Text>
        <Text className="text-sm text-red-700 dark:text-red-300">{t('booking.notAvailableMessage')}</Text>
      </View>
    );
  }

  if (status === 'offline' || status === 'failed') {
    return (
      <View className="gap-2">
        <Text accessibilityRole="alert" className="text-sm text-red-600 dark:text-red-500">
          {status === 'offline' ? t('booking.offline') : t('booking.failed')}
        </Text>
        <Button size="sm" variant="ghost" label={t('common.retry')} onPress={onRetry} />
      </View>
    );
  }

  return null;
}

function ContinueButton({
  state,
  onPress,
}: {
  state: ReturnType<typeof continueState>;
  onPress: () => void | Promise<unknown>;
}) {
  const { t } = useUiTranslation();

  // The disabled button says why, so the rider is never left guessing what is missing.
  return (
    <Button
      fullWidth
      variant="primary"
      label={state.enabled ? t('booking.continue') : reasonText(state.reason, t)}
      disabled={!state.enabled}
      onPress={onPress}
    />
  );
}

function reasonText(reason: ContinueReason, t: (key: string) => string): string {
  switch (reason) {
    case 'locating':
      return t('booking.findingYou');
    case 'need_pickup':
      return t('booking.needPickup');
    case 'need_dropoff':
      return t('booking.needDropoff');
    case 'same_spot':
      return t('booking.sameSpot');
    case 'outside':
      return t('booking.outside');
    case 'no_prices':
      return t('booking.noPrices');
    case 'offline':
      return t('booking.offline');
    case 'failed':
      return t('booking.failed');
    default:
      return t('booking.checking');
  }
}

function PinAddress({ failed, address, onRetry }: { failed: boolean; address: string | null; onRetry: () => void }) {
  const { t } = useUiTranslation();

  if (address !== null) {
    return <Text className="text-sm font-manrope-semibold text-slate-950 dark:text-white">{address}</Text>;
  }

  if (failed) {
    return (
      <View className="gap-2">
        <Text accessibilityRole="alert" className="text-sm text-red-600 dark:text-red-500">
          {t('location.addressFailed')}
        </Text>
        <Button size="sm" variant="ghost" label={t('common.retry')} onPress={onRetry} />
      </View>
    );
  }

  return (
    <Text accessibilityLiveRegion="polite" className="text-sm text-slate-500 dark:text-slate-400">
      {t('location.resolving')}
    </Text>
  );
}
