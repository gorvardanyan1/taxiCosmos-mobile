import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useUiTranslation } from '../i18n/hooks';
import { cx } from './cx';
import { Text } from './Text';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once with the full code the moment the last digit is in (typed, pasted or auto-filled from the SMS). */
  onComplete?: (code: string) => void;
  length?: number;
  /** What is wrong with the code (wrong, expired, locked), shown under the boxes. */
  error?: string;
  editable?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * The one-time-code entry: one real input stretched over the boxes, so the keyboard, paste and the SMS auto-fill (iOS one-time-code, Android SMS
 * retriever) all work, while the boxes only show the digits.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  error,
  editable = true,
  autoFocus = false,
  className,
}: OtpInputProps) {
  const { t } = useUiTranslation();
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, '').slice(0, length);
  const current = Math.min(digits.length, length - 1);

  const handleChange = (text: string) => {
    const next = text.replace(/\D/g, '').slice(0, length);
    onChange(next);

    if (next.length === length && digits.length !== length) {
      onComplete?.(next);
    }
  };

  return (
    <View className={className}>
      <View className="relative">
        <View
          className="flex-row justify-between gap-2"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length }, (_, index) => {
            const digit = digits[index];
            const active = focused && index === current && editable;

            return (
              <View
                key={index}
                className={cx(
                  'h-14 flex-1 items-center justify-center rounded-2xl border bg-white dark:bg-slate-900',
                  error
                    ? 'border-red-500'
                    : active
                      ? 'border-slate-950 dark:border-white'
                      : 'border-slate-200 dark:border-slate-700',
                  !editable && 'opacity-50',
                )}
              >
                <Text className="text-xl font-manrope-extrabold text-slate-950 dark:text-white">{digit ?? ''}</Text>
              </View>
            );
          })}
        </View>
        <TextInput
          value={digits}
          onChangeText={handleChange}
          editable={editable}
          autoFocus={autoFocus}
          maxLength={length + 8}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          caretHidden
          accessibilityLabel={t('otp.label')}
          accessibilityHint={error ?? t('otp.hint', { length })}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="absolute inset-0 opacity-0"
        />
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          className="mt-2 text-center text-xs font-manrope-semibold text-red-600 dark:text-red-500"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
