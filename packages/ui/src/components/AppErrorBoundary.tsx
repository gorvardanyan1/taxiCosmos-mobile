import { Component, type ErrorInfo, type ReactNode } from 'react';

import { useUiTranslation } from '../i18n/hooks';
import { StatusScreen } from './StatusScreen';

export interface AppErrorBoundaryProps {
  children: ReactNode;
  /**
   * Called once for every error the boundary catches, with the error and the component stack: report it here (the apps send it to Sentry,
   * which scrubs personal data). A reporter that itself fails is ignored: it must never turn a recoverable error into a crash.
   */
  onError?: (error: Error, componentStack: string | null) => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches an error thrown while any screen below it renders, reports it and shows a screen with a retry button, so one broken screen
 * does not end the app. "Try again" renders the screens again from scratch, without restarting the app.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      this.props.onError?.(error, info.componentStack ?? null);
    } catch {
      // The report could not be sent; the person still gets the recovery screen.
    }
  }

  private reset = () => this.setState({ error: null });

  override render(): ReactNode {
    return this.state.error === null ? this.props.children : <ErrorFallback onRetry={this.reset} />;
  }
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useUiTranslation();

  return (
    <StatusScreen
      icon="alert"
      tone="danger"
      title={t('shell.errorBoundaryTitle')}
      message={t('shell.errorBoundaryMessage')}
      primaryAction={{ label: t('common.retry'), onPress: onRetry }}
    />
  );
}
