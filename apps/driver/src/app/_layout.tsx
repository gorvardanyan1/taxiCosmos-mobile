import * as Sentry from '@sentry/react-native';
import { ApiProvider } from '@taxikosmos/api-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { monitoringOptions } from '@taxikosmos/core/config';

import { appApi } from '../api';
import { appConfig } from '../config';

Sentry.init(monitoringOptions(appConfig));

function RootLayout() {
  return (
    <ApiProvider client={appApi.client} realtime={appApi.realtime}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </ApiProvider>
  );
}

export default Sentry.wrap(RootLayout);
