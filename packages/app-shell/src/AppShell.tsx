import type { AppClient } from '@taxikosmos/core';
import { AppErrorBoundary, LoadingScreen } from '@taxikosmos/ui';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AccountBlockedScreen } from './screens/AccountBlockedScreen';
import { AccountUnavailableScreen } from './screens/AccountUnavailableScreen';
import { UpdateRequiredScreen } from './screens/UpdateRequiredScreen';
import { useAppGate } from './useAppGate';

export interface AppShellProps {
  app: AppClient;
  /** This build's version, for the update check. */
  version: string | undefined;
  /** Every error the boundary catches (the apps report it to Sentry, which scrubs personal data). */
  onError?: (error: Error, componentStack: string | null) => void;
  children: ReactNode;
}

/**
 * Wraps the whole app, below the UI provider and the API provider:
 *  - an error anywhere below is caught, reported, and replaced by a screen with a retry button;
 *  - before the screens, the gate decides whether this build may run, who is signed in and whether their account may use the app.
 *
 * The screens are shown once something real can be shown (signed out, or signed in with a usable account). After that they stay mounted
 * under whatever the gate shows later (a suspension noticed on returning to the app, an update that became mandatory), so the router keeps
 * its place and the person is back exactly where they were once the account is fine again. The screens underneath are untouchable and hidden
 * from screen readers meanwhile.
 */
export function AppShell({ app, version, onError, children }: AppShellProps) {
  return (
    <AppErrorBoundary {...(onError ? { onError } : {})}>
      <Gate app={app} version={version}>
        {children}
      </Gate>
    </AppErrorBoundary>
  );
}

function Gate({ app, version, children }: { app: AppClient; version: string | undefined; children: ReactNode }) {
  const { gate, config, retry } = useAppGate({ app, version });
  // Set once the screens have been shown for the first time (React's way of remembering something learned while rendering).
  const [shown, setShown] = useState(false);

  const overlay =
    gate.kind === 'loading' ? (
      <LoadingScreen />
    ) : gate.kind === 'update_required' ? (
      <UpdateRequiredScreen storeUrl={config?.update.store_url ?? null} />
    ) : gate.kind === 'blocked' ? (
      <AccountBlockedScreen reason={gate.reason} support={config?.support} />
    ) : gate.kind === 'account_unavailable' ? (
      <AccountUnavailableScreen onRetry={retry} />
    ) : null;

  if (overlay === null && !shown) {
    setShown(true);
  }

  if (!shown && overlay !== null) {
    return overlay;
  }

  const covered = overlay !== null;

  return (
    <View style={styles.fill}>
      <View
        style={styles.fill}
        pointerEvents={covered ? 'none' : 'auto'}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {covered ? <View style={StyleSheet.absoluteFill}>{overlay}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
