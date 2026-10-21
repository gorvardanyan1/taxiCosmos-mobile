import { useAppConfig, useMe, useSessionStatus } from '@taxikosmos/api-client';
import {
  resolveGate,
  type AppClient,
  type AppConfig,
  type AppPlatform,
  type AsyncState,
  type Gate,
} from '@taxikosmos/core';
import { Platform } from 'react-native';

export interface AppIdentity {
  app: AppClient;
  /** This build's version (`Constants.expoConfig?.version`). Without one the server treats the build as unsupported. */
  version: string | undefined;
}

export interface AppGate {
  gate: Gate;
  config: AppConfig | undefined;
  /** Asks the account (and the start-up config, if it failed) again. */
  retry: () => void;
}

const platform: AppPlatform = Platform.OS === 'ios' ? 'ios' : 'android';

/** An answer already in hand wins over a refresh that is running or failed: the screen does not flicker or lock because a refetch did. */
function stateOf(query: { data: unknown; isPending: boolean; isError: boolean }): AsyncState {
  if (query.data !== undefined) {
    return 'ready';
  }

  return query.isPending ? 'loading' : query.isError ? 'failed' : 'idle';
}

/**
 * Joins the three facts the gate needs (the saved session, the start-up config, the account) and lets `resolveGate` decide.
 * Everything is read over REST and refreshed when the app comes back to the foreground, so a suspension that happened while the app was
 * in the pocket shows up the moment it is opened again.
 */
export function useAppGate({ app, version }: AppIdentity): AppGate {
  const session = useSessionStatus();
  const config = useAppConfig({ app, platform, version });
  const me = useMe();

  const gate = resolveGate({
    session,
    config: { state: stateOf(config), forceUpdate: config.data?.update.force_update },
    me:
      session === 'signed_in' ? { state: stateOf(me), status: me.data?.status } : { state: 'idle', status: undefined },
  });

  return {
    gate,
    config: config.data,
    retry: () => {
      if (config.data === undefined) {
        void config.refetch();
      }

      void me.refetch();
    },
  };
}
