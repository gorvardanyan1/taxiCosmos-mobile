import '../../global.css';

import * as Sentry from '@sentry/react-native';
import { ApiProvider } from '@taxikosmos/api-client';
import { UiProvider } from '@taxikosmos/ui';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { monitoringOptions } from '@taxikosmos/core/config';

import { appApi } from '../api';
import { appConfig } from '../config';

Sentry.init(monitoringOptions(appConfig));

// Keep the splash screen up until the fonts, the saved theme and the saved language are ready, so the first frame is already right.
void SplashScreen.preventAutoHideAsync();

function RootLayout() {
  return (
    <ApiProvider client={appApi.client} realtime={appApi.realtime}>
      <UiProvider onReady={() => void SplashScreen.hideAsync()}>
        <Stack screenOptions={{ headerShown: false }} />
      </UiProvider>
    </ApiProvider>
  );
}

export default Sentry.wrap(RootLayout);
