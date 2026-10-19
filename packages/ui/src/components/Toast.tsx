import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUiTranslation } from '../i18n/hooks';
import { Icon, type IconName } from '../icons/Icon';
import { brand, raw } from '../theme/tokens.js';
import { Text } from './Text';

export type ToastTone = 'neutral' | 'success' | 'error';

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  onDismiss?: () => void;
}

const TONE: Record<ToastTone, { icon: IconName; color: string }> = {
  neutral: { icon: 'bell', color: brand.accent },
  success: { icon: 'check', color: raw.emerald[400] },
  error: { icon: 'alert', color: raw.red[400] },
};

/** A short message on an ink pill. Screen readers announce it when it appears. */
export function Toast({ message, tone = 'neutral', onDismiss }: ToastProps) {
  const { t } = useUiTranslation();

  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-slate-950 py-3 pl-4 pr-2 shadow-2xl dark:border dark:border-slate-700">
      <Icon name={TONE[tone].icon} size={18} color={TONE[tone].color} />
      {/* The message is the alert, not the whole pill: the dismiss button next to it must stay a control of its own. */}
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        className="flex-1 text-sm font-manrope-bold text-white"
      >
        {message}
      </Text>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.dismiss')}
          onPress={onDismiss}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-white/10"
        >
          <Icon name="close" size={16} color={raw.slate[400]} />
        </Pressable>
      ) : null}
    </View>
  );
}

export interface ShowToastOptions {
  message: string;
  tone?: ToastTone;
  /** Milliseconds before it goes away on its own (default 4000). */
  duration?: number;
}

interface ToastContextValue {
  show: (options: ShowToastOptions) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const DEFAULT_TOAST_DURATION = 4000;

/** Shows one toast at a time at the top of the screen; a new one replaces the old. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ShowToastOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clear();
    setToast(null);
  }, [clear]);

  const show = useCallback(
    (options: ShowToastOptions) => {
      clear();
      setToast(options);
      timer.current = setTimeout(() => setToast(null), options.duration ?? DEFAULT_TOAST_DURATION);
    },
    [clear],
  );

  useEffect(() => clear, [clear]);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" className="absolute inset-x-0 top-0 px-4" style={{ paddingTop: insets.top + 8 }}>
          <Toast message={toast.message} tone={toast.tone} onDismiss={dismiss} />
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);

  if (value === null) {
    throw new Error('useToast must be used inside <UiProvider>.');
  }

  return value;
}
