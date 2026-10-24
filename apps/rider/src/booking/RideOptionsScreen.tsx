import { useGeoRoute } from '@taxikosmos/api-client';
import {
  decodePolyline,
  formatMoneyRange,
  midpoint,
  zoomToFit,
  type FareEstimate,
  type LatLng,
  type VehicleClass,
} from '@taxikosmos/core';
import { Button, Card, Icon, IconButton, MapView, Text, useLocale, useUiTranslation } from '@taxikosmos/ui';
import { Redirect, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appConfig } from '../config';
import { chosenEstimate, surgeOf, usableEstimates } from './rideOptions';
import { useTripDraft } from './TripDraft';
import { useQuoteLifecycle, type QuoteStatus } from './useQuoteLifecycle';

/**
 * The ride options (M4-T2): the route on the map, one card per vehicle class with its estimated price range (and a note when prices are
 * raised), the rider's choice, and how they will pay (cash: the MVP). Switching class only changes the choice and the price shown; the quote
 * stays the same. The price is kept true by `useQuoteLifecycle`: an expired quote is replaced, and when no price can be had the screen
 * shows why with a retry, never a zero or empty price. Without a chosen route there is nothing to price, so the rider goes back to the start.
 */
export function RideOptionsScreen() {
  const { t } = useUiTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, updateDraft } = useTripDraft();
  const { status, refresh } = useQuoteLifecycle();
  const route = useGeoRoute(draft?.pickup ?? null, draft?.dropoff ?? null);
  const routePoints = useMemo(() => pointsOf(route.data?.polyline), [route.data?.polyline]);

  if (draft === null) {
    return <Redirect href="/" />;
  }

  const estimates = usableEstimates(draft.quote);
  const chosen = chosenEstimate(estimates, draft.vehicleClass);
  const shown: QuoteStatus = status === 'ready' && chosen === null ? 'failed' : status;
  const pickup: LatLng = draft.pickup;
  const dropoff: LatLng = draft.dropoff;

  return (
    <View className="flex-1 bg-paper dark:bg-slate-950">
      <MapView
        center={midpoint(pickup, dropoff)}
        zoom={zoomToFit(pickup, dropoff)}
        markers={[
          { id: 'pickup', kind: 'pickup', location: pickup, label: t('booking.markerPickup') },
          { id: 'dropoff', kind: 'dropoff', location: dropoff, label: t('booking.markerDropoff') },
        ]}
        route={routePoints}
        {...(appConfig.mapTileUrl ? { tileUrl: appConfig.mapTileUrl } : {})}
      />
      <View className="absolute left-4" style={{ top: insets.top + 12 }}>
        <IconButton icon="close" label={t('booking.back')} onPress={() => router.back()} />
      </View>
      <View className="absolute left-4 right-4" style={{ bottom: insets.bottom + 16 }}>
        <Card>
          <View className="gap-4">
            <Text
              accessibilityRole="header"
              className="text-screen-title font-manrope-extrabold text-slate-950 dark:text-white"
            >
              {t('booking.rideOptionsTitle')}
            </Text>
            {shown === 'ready' || shown === 'refreshing' ? (
              <Options
                estimates={estimates}
                chosen={chosen}
                busy={shown === 'refreshing'}
                onChoose={(vehicleClass) => updateDraft({ vehicleClass })}
              />
            ) : (
              <Failure status={shown} onRetry={refresh} onBack={() => router.back()} />
            )}
          </View>
        </Card>
      </View>
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
    // A line that cannot be read is left off the map: the prices do not depend on it.
    return [];
  }
}

function Options({
  estimates,
  chosen,
  busy,
  onChoose,
}: {
  estimates: readonly FareEstimate[];
  chosen: FareEstimate | null;
  busy: boolean;
  onChoose: (vehicleClass: VehicleClass) => void;
}) {
  const { t } = useUiTranslation();
  const { locale } = useLocale();
  const range = (estimate: FareEstimate) =>
    formatMoneyRange(estimate.amount_min, estimate.amount_max, estimate.currency, locale);

  return (
    <View className="gap-4" accessibilityState={{ busy }}>
      <ScrollView className="max-h-64" accessibilityRole="radiogroup" contentContainerStyle={{ gap: 12 }}>
        {estimates.map((estimate) => {
          const selected = estimate.vehicle_class === chosen?.vehicle_class;
          const surge = surgeOf(estimate);
          const name = t(`rideOptions.${estimate.vehicle_class}`);

          return (
            <Pressable
              key={estimate.vehicle_class}
              accessibilityRole="radio"
              accessibilityLabel={t('rideOptions.classCard', { name, price: range(estimate) })}
              accessibilityHint={surge === null ? undefined : t('rideOptions.surgeHint')}
              accessibilityState={{ selected, busy }}
              disabled={busy}
              onPress={() => onChoose(estimate.vehicle_class)}
              className={`min-h-[72px] flex-row items-center gap-3 rounded-2xl border-2 px-4 py-3 ${
                selected
                  ? 'border-slate-950 bg-white dark:border-white dark:bg-slate-900'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
              } ${busy ? 'opacity-60' : ''}`}
            >
              <View className="h-11 w-11 items-center justify-center rounded-full bg-accent-soft dark:bg-slate-800">
                <Icon name="car" size={22} />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-base font-manrope-extrabold text-slate-950 dark:text-white">{name}</Text>
                {surge !== null ? (
                  <Text className="self-start rounded-full bg-accent px-2 py-0.5 text-xs font-manrope-extrabold text-slate-950">
                    {t('rideOptions.surge', {
                      multiplier: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(surge),
                    })}
                  </Text>
                ) : null}
              </View>
              <Text className="text-base font-manrope-extrabold text-slate-950 dark:text-white">{range(estimate)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {busy ? (
        <Text accessibilityLiveRegion="polite" className="text-center text-sm text-slate-500 dark:text-slate-400">
          {t('rideOptions.refreshing')}
        </Text>
      ) : chosen !== null ? (
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-slate-500 dark:text-slate-400">{t('rideOptions.estimatedFare')}</Text>
          <Text
            accessibilityLiveRegion="polite"
            className="text-lg font-manrope-extrabold text-slate-950 dark:text-white"
          >
            {range(chosen)}
          </Text>
        </View>
      ) : null}
      <Text className="text-xs text-slate-500 dark:text-slate-400">{t('rideOptions.estimatedNote')}</Text>
      <View className="flex-row items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800">
        <Icon name="wallet" size={20} />
        <View className="flex-1">
          <Text className="text-xs font-manrope-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            {t('rideOptions.payment')}
          </Text>
          <Text className="text-sm font-manrope-bold text-slate-950 dark:text-white">{t('rideOptions.cash')}</Text>
          <Text className="text-xs text-slate-500 dark:text-slate-400">{t('rideOptions.cashHint')}</Text>
        </View>
      </View>
    </View>
  );
}

function Failure({
  status,
  onRetry,
  onBack,
}: {
  status: Exclude<QuoteStatus, 'ready' | 'refreshing'>;
  onRetry: () => void | Promise<unknown>;
  onBack: () => void;
}) {
  const { t } = useUiTranslation();
  const fixable = status === 'offline' || status === 'failed';
  const title =
    status === 'offline'
      ? t('rideOptions.offlineTitle')
      : status === 'failed'
        ? t('rideOptions.failedTitle')
        : t('booking.notAvailableTitle');
  const message =
    status === 'offline'
      ? t('booking.offline')
      : status === 'failed'
        ? t('rideOptions.failedMessage')
        : status === 'outside'
          ? t('rideOptions.outsideMessage')
          : t('rideOptions.noPricesMessage');

  return (
    <View accessibilityRole="alert" className="gap-3">
      <Text className="text-base font-manrope-extrabold text-slate-950 dark:text-white">{title}</Text>
      <Text className="text-sm text-slate-500 dark:text-slate-400">{message}</Text>
      {fixable ? <Button fullWidth variant="primary" label={t('common.retry')} onPress={onRetry} /> : null}
      <Button fullWidth variant="ghost" label={t('booking.back')} onPress={onBack} />
    </View>
  );
}
