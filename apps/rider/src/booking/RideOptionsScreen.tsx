import { Button, Card, Text, useUiTranslation } from '@taxikosmos/ui';
import { Redirect, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTripDraft } from './TripDraft';

/**
 * Where the home screen hands over (M4-T2 builds the ride options and the fare here): the route the rider chose, priced by the quote in the draft.
 * Without a draft (a link opened cold) there is nothing to choose a ride for, so the rider goes back to the start.
 */
export function RideOptionsScreen() {
  const { t } = useUiTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft } = useTripDraft();

  if (draft === null) {
    return <Redirect href="/" />;
  }

  return (
    <View
      className="flex-1 justify-center gap-6 bg-paper px-6 dark:bg-slate-950"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <Text
        accessibilityRole="header"
        className="text-screen-title font-manrope-extrabold text-slate-950 dark:text-white"
      >
        {t('booking.rideOptionsTitle')}
      </Text>
      <Card>
        <View className="gap-3">
          <Text className="text-sm font-manrope-bold text-slate-950 dark:text-white">{draft.pickup.address}</Text>
          <Text className="text-sm font-manrope-bold text-slate-950 dark:text-white">{draft.dropoff.address}</Text>
          <Text className="text-sm text-slate-500 dark:text-slate-400">{t('booking.rideOptionsMessage')}</Text>
        </View>
      </Card>
      <Button fullWidth variant="ghost" label={t('booking.back')} onPress={() => router.back()} />
    </View>
  );
}
