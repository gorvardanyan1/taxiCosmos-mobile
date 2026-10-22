import { useGeoReverse } from '@taxikosmos/api-client';
import { DEFAULT_MAP_CENTER, toAddressPoint, type AddressPoint, type LatLng } from '@taxikosmos/core';
import { Button, Card, MapView, Text, useUiTranslation } from '@taxikosmos/ui';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddressSearch } from '../location/AddressSearch';
import { LocationPrompt } from '../location/LocationPrompt';
import { useForegroundLocation } from '../location/useForegroundLocation';

/**
 * The map, the location permission and the address search working together, as the booking screens (M4) will use them: the map opens on the
 * phone's position if it is known (the city centre otherwise), a pin in the middle picks a spot by dragging the map and shows its address, and
 * the address box picks one by typing. Refusing the location never takes anything away: the map and the box stay.
 * A development and staging tool until booking exists.
 */
export function MapPreviewScreen({ tileUrl }: { tileUrl?: string | undefined }) {
  const { t } = useUiTranslation();
  const insets = useSafeAreaInsets();
  const location = useForegroundLocation();
  const [center, setCenter] = useState<LatLng>(DEFAULT_MAP_CENTER);
  // The spot whose address is asked for: where the map was last left, or where the phone is.
  const [spot, setSpot] = useState<LatLng | null>(null);
  // A place chosen from the address box wins over the address of the spot until the map is moved again.
  const [picked, setPicked] = useState<AddressPoint | null>(null);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [seenPosition, setSeenPosition] = useState<LatLng | null>(null);
  const reverse = useGeoReverse(picked === null ? spot : null);

  // A new position from the phone moves the map there (React's way of reacting to a changed input while rendering).
  if (location.position !== seenPosition) {
    setSeenPosition(location.position);

    if (location.position !== null) {
      setCenter(location.position);
      setSpot(location.position);
      setPicked(null);
    }
  }

  const address: AddressPoint | null = picked ?? (reverse.data ? toAddressPoint(reverse.data) : null);
  const prompt =
    location.permission === 'undetermined' || location.permission === 'denied' || location.permission === 'blocked'
      ? location.permission
      : null;

  const locate = async () => {
    if (location.permission === 'granted') {
      setPromptDismissed(false);
      await location.locate();
    } else {
      setPromptDismissed(false);
    }
  };

  return (
    <View className="flex-1 bg-paper dark:bg-slate-950">
      <MapView
        center={center}
        centerPin={{ kind: 'pickup', label: t('location.pickupPin') }}
        onCenterChange={(next) => {
          setCenter(next);
          setSpot(next);
          setPicked(null);
        }}
        onLocate={() => void locate()}
        {...(tileUrl ? { tileUrl } : {})}
      />
      <View className="absolute left-4 right-4" style={{ top: insets.top + 12 }}>
        <AddressSearch
          near={location.position}
          onSelect={(point) => {
            setPicked(point);
            setCenter(point);
            setSpot(point);
          }}
        />
      </View>
      <View className="absolute left-4 right-4 gap-3" style={{ bottom: insets.bottom + 16 }}>
        <AddressCard
          locating={location.locating}
          locationFailed={location.failed}
          address={address?.address ?? null}
          resolving={picked === null && spot !== null && reverse.isFetching && address === null}
          failed={picked === null && reverse.isError}
          onRetry={() => void reverse.refetch()}
        />
        {prompt !== null && !promptDismissed ? (
          <LocationPrompt
            kind={prompt}
            onAllow={location.request}
            onOpenSettings={() => Linking.openSettings()}
            onDismiss={() => setPromptDismissed(true)}
          />
        ) : null}
      </View>
    </View>
  );
}

interface AddressCardProps {
  locating: boolean;
  locationFailed: boolean;
  address: string | null;
  resolving: boolean;
  failed: boolean;
  onRetry: () => void;
}

function AddressCard({ locating, locationFailed, address, resolving, failed, onRetry }: AddressCardProps) {
  const { t } = useUiTranslation();
  const message = locating
    ? t('location.locating')
    : resolving
      ? t('location.resolving')
      : address !== null
        ? t('location.selected', { address })
        : failed
          ? t('location.addressFailed')
          : locationFailed
            ? t('location.unavailable')
            : null;

  if (message === null) {
    return null;
  }

  return (
    <Card>
      <Text
        accessibilityLiveRegion="polite"
        accessibilityRole={failed || locationFailed ? 'alert' : undefined}
        className="text-sm font-manrope-semibold text-slate-950 dark:text-white"
      >
        {message}
      </Text>
      {failed && !locating ? (
        <Button className="mt-3" size="sm" variant="ghost" label={t('common.retry')} onPress={onRetry} />
      ) : null}
    </Card>
  );
}
