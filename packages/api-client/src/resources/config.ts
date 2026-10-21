import type { AppConfig, AppConfigQuery } from '@taxikosmos/core';

import type { ApiClient } from '../client';

export function appConfigApi(client: ApiClient) {
  return {
    /**
     * What this build needs at start-up: may it still run (`update.force_update`), which features are on, how to reach support.
     * Public: no sign-in needed, so it works before the person has an account. A missing `version` makes the server treat the build as unsupported.
     */
    async get({ app, platform, version }: AppConfigQuery, signal?: AbortSignal): Promise<AppConfig> {
      return (
        await client.get<AppConfig>('/app-config', {
          query: { app, platform, version },
          auth: false,
          signal,
          // A start-up call: one more try on a dropped connection, then the app carries on without it.
          retries: 1,
          timeoutMs: 8_000,
        })
      ).data;
    },
  };
}
