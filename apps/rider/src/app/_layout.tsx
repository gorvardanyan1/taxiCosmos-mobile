import '../../global.css';

import * as Sentry from '@sentry/react-native';
import { ApiProvider } from '@taxikosmos/api-client';
import { AppShell } from '@taxikosmos/app-shell';
import { monitoringOptions } from '@taxikosmos/core/config';
import { UiProvider } from '@taxikosmos/ui';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { appApi } from '../api';
import { TripDraftProvider } from '../booking/TripDraft';
import { appConfig } from '../config';

// Personal data is removed from every report before it leaves the phone (see `scrubEvent` in @taxikosmos/core).
Sentry.init(monitoringOptions(appConfig));

// Keep the splash screen up until the fonts, the saved theme and the saved language are ready, so the first frame is already right.
void SplashScreen.preventAutoHideAsync();

/** An error that reached the boundary: report it (the component stack names components, never data). */
function reportError(error: Error, componentStack: string | null) {
  Sentry.captureException(error, { contexts: { react: { componentStack } } });
}

function RootLayout() {
  return (
    <ApiProvider client={appApi.client} realtime={appApi.realtime}>
      <UiProvider onReady={() => void SplashScreen.hideAsync()}>
        <AppShell app={appConfig.app} version={Constants.expoConfig?.version} onError={reportError}>
          <TripDraftProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </TripDraftProvider>
        </AppShell>
      </UiProvider>
    </ApiProvider>
  );
}

export default Sentry.wrap(RootLayout);
