import Constants from 'expo-constants';

import { readPublicConfig } from '@taxikosmos/core/config';

/** This build's public configuration (environment, API origin, Sentry DSN), written by app.config.ts. */
export const appConfig = readPublicConfig(Constants.expoConfig?.extra);
