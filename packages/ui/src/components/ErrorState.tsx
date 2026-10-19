import { View } from 'react-native';

import { useUiTranslation } from '../i18n/hooks';
import { Icon } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { cx } from './cx';
import { Text } from './Text';

export interface ErrorStateProps {
  /** What went wrong, if the screen knows; otherwise the generic text of the kind (`error` or `offline`). */
  title?: string;
  message?: string;
  /** `offline` says the phone has no connection and uses the amber icon; `error` is any other failure. */
  kind?: 'error' | 'offline';
  /** The retry button appears when this is given. It may return a promise: the button then shows progress until it settles. */
  onRetry?: () => void | Promise<unknown>;
  className?: string;
}

/** A failed load with a way to try again. */
export function ErrorState({ title, message, kind = 'error', onRetry, className }: ErrorStateProps) {
  const { t } = useUiTranslation();
  const { colors } = useTheme();
  const offline = kind === 'offline';

  return (
    <View className={cx('items-center px-8 py-10', className)}>
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-400/15">
        <Icon name="alert" size={28} color={offline ? colors.warning : colors.danger} />
      </View>
      <Text
        accessibilityRole="alert"
        className="text-center text-lg font-manrope-extrabold text-slate-950 dark:text-white"
      >
        {title ?? t(offline ? 'states.offlineTitle' : 'states.errorTitle')}
      </Text>
      <Text className="mt-1.5 text-center text-sm leading-5 text-slate-500 dark:text-slate-400">
        {message ?? t(offline ? 'states.offlineMessage' : 'states.errorMessage')}
      </Text>
      {onRetry ? (
        <Button className="mt-5" size="sm" variant="primary" label={t('common.retry')} onPress={onRetry} />
      ) : null}
    </View>
  );
}
