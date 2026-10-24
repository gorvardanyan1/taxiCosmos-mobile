import { useCancelTrip, usePollingInterval, useTrip } from '@taxikosmos/api-client';
import { getApiError, isOffline, type Trip } from '@taxikosmos/core';
import { Button, Card, ErrorState, LoadingScreen, MapView, Text, useUiTranslation } from '@taxikosmos/ui';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appConfig } from '../config';
import { SearchPulse } from './SearchPulse';
import { useTripDraft } from './TripDraft';

/** How often a trip being watched is asked for again (there is no realtime service in the MVP; a trip is also re-read when the app comes back). */
const POLL_MS = 4000;

const PICKUP_ZOOM = 15;

/** A trip id from the address: whole, positive and sane, or `null` (a link with anything else goes back to the start). */
function tripIdOf(value: string | string[] | undefined): number | null {
  return typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
}

/**
 * The rider's trip after "Request": while a driver is being found (the animated radius and a cancel action), when nobody could be found, and
 * a plain card for a trip that has a driver (the live trip is M4-T4). The trip is read over REST by its id and re-read every few seconds, so
 * what is shown is what the server says; closing the app and opening it again finds the same trip through `GET /trips/current` (the home screen
 * sends the rider here). A trip that is over takes the rider back to the start.
 */
export function TripScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tripId = tripIdOf(id);

  return tripId === null ? <Redirect href="/" /> : <TripView id={tripId} />;
}

function TripView({ id }: { id: number }) {
  const { t } = useUiTranslation();
  const router = useRouter();
  const { draft, setDraft } = useTripDraft();
  const trip = useTrip(id, { refetchInterval: usePollingInterval(POLL_MS) });
  const status = trip.data?.status;
  const gone = getApiError(trip.error)?.kind === 'not_found';
  const over = gone || status === 'cancelled' || status === 'completed';

  // The trip is over (cancelled here or elsewhere, finished, or not the rider's): back to a clean booking screen.
  useEffect(() => {
    if (over) {
      setDraft(null);
      router.dismissTo('/');
    }
  }, [over, router, setDraft]);

  if (over) {
    return <LoadingScreen />;
  }

  if (trip.data === undefined) {
    return trip.isError ? (
      <View className="flex-1 justify-center bg-paper dark:bg-slate-950">
        <ErrorState
          kind={isOffline(trip.error) ? 'offline' : 'error'}
          title={t('trip.loadFailedTitle')}
          message={t('trip.loadFailedMessage')}
          onRetry={() => trip.refetch()}
        />
      </View>
    ) : (
      <LoadingScreen />
    );
  }

  return (
    <TripMap trip={trip.data}>
      {trip.isError ? (
        <Text accessibilityRole="alert" className="text-center text-xs text-slate-500 dark:text-slate-400">
          {t('trip.connectionLost')}
        </Text>
      ) : null}
      {trip.data.status === 'requested' ? <Searching trip={trip.data} /> : null}
      {trip.data.status === 'no_driver_found' ? (
        <NoDriver
          onRetry={() => router.replace(draft === null ? '/' : '/ride-options')}
          onBack={() => {
            setDraft(null);
            router.dismissTo('/');
          }}
        />
      ) : null}
      {trip.data.status === 'matched' || trip.data.status === 'arrived' || trip.data.status === 'in_progress' ? (
        <WithDriver trip={trip.data} />
      ) : null}
    </TripMap>
  );
}

function TripMap({ trip, children }: { trip: Trip; children: React.ReactNode }) {
  const { t } = useUiTranslation();
  const insets = useSafeAreaInsets();
  const searching = trip.status === 'requested';

  return (
    <View className="flex-1 bg-paper dark:bg-slate-950">
      <MapView
        center={trip.pickup}
        zoom={PICKUP_ZOOM}
        markers={[{ id: 'pickup', kind: 'pickup', location: trip.pickup, label: t('booking.markerPickup') }]}
        {...(appConfig.mapTileUrl ? { tileUrl: appConfig.mapTileUrl } : {})}
      />
      {searching ? <SearchPulse /> : null}
      <View className="absolute left-4 right-4" style={{ bottom: insets.bottom + 16 }}>
        <Card>
          <View className="gap-4">{children}</View>
        </Card>
      </View>
    </View>
  );
}

function Searching({ trip }: { trip: Trip }) {
  const { t } = useUiTranslation();
  const cancel = useCancelTrip();

  return (
    <>
      <View className="gap-1">
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          className="text-screen-title font-manrope-extrabold text-slate-950 dark:text-white"
        >
          {t('trip.searchingTitle')}
        </Text>
        <Text className="text-sm text-slate-500 dark:text-slate-400">{t('trip.searchingMessage')}</Text>
      </View>
      {cancel.isError ? (
        <View accessibilityRole="alert" className="gap-1">
          <Text className="text-base font-manrope-extrabold text-slate-950 dark:text-white">
            {t('trip.cancelOfflineTitle')}
          </Text>
          <Text className="text-sm text-slate-500 dark:text-slate-400">
            {t(isOffline(cancel.error) ? 'trip.cancelOfflineMessage' : 'trip.cancelFailedMessage')}
          </Text>
        </View>
      ) : null}
      <Button
        fullWidth
        variant="ghost"
        label={cancel.isError ? t('common.retry') : t('trip.cancel')}
        // The button stays busy until the answer is in, so a second tap cannot send a second cancel; a failed one is retried with the same key.
        onPress={() => cancel.mutateAsync(trip.id).catch(() => undefined)}
      />
    </>
  );
}

function NoDriver({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  const { t } = useUiTranslation();

  return (
    <>
      <View accessibilityRole="alert" className="gap-1">
        <Text
          accessibilityRole="header"
          className="text-screen-title font-manrope-extrabold text-slate-950 dark:text-white"
        >
          {t('trip.noDriverTitle')}
        </Text>
        <Text className="text-sm text-slate-500 dark:text-slate-400">{t('trip.noDriverMessage')}</Text>
      </View>
      <Button fullWidth variant="primary" label={t('common.retry')} onPress={onRetry} />
      <Button fullWidth variant="ghost" label={t('trip.backHome')} onPress={onBack} />
    </>
  );
}

/** A trip that has a driver: the live trip screen is M4-T4, until then the rider sees who is coming. */
function WithDriver({ trip }: { trip: Trip }) {
  const { t } = useUiTranslation();
  const title =
    trip.status === 'matched'
      ? t('trip.onTheWay')
      : trip.status === 'arrived'
        ? t('trip.arrived')
        : t('trip.inProgress');

  return (
    <View className="gap-1">
      <Text
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        className="text-screen-title font-manrope-extrabold text-slate-950 dark:text-white"
      >
        {title}
      </Text>
      {trip.driver !== null ? (
        <Text className="text-base font-manrope-bold text-slate-950 dark:text-white">{trip.driver.name}</Text>
      ) : null}
      {trip.vehicle !== null ? (
        <Text className="text-sm text-slate-500 dark:text-slate-400">
          {t('trip.vehicleLine', {
            color: trip.vehicle.color,
            make: trip.vehicle.make,
            model: trip.vehicle.model,
            plate: trip.vehicle.plate_number,
          })}
        </Text>
      ) : null}
    </View>
  );
}
