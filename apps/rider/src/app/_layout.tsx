import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { monitoringOptions } from '@taxikosmos/core/config';

import { appConfig } from '../config';

Sentry.init(monitoringOptions(appConfig));

function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default Sentry.wrap(RootLayout);
