import { createAppApi } from '@taxikosmos/api-client/secure-store';

import { appConfig } from './config';

/**
 * This app's connection to the backend: one client for the whole app, with the session in the secure store. Screens do not import it;
 * they use the hooks from `@taxikosmos/api-client` (`useMe`, `useUpdateMe`, …) under the provider in the root layout.
 */
export const appApi = createAppApi({ app: 'driver', baseUrl: appConfig.apiUrl, realtimeUrl: appConfig.realtimeUrl });
