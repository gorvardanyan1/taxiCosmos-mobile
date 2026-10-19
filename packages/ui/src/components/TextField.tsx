import { useState, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { cx } from './cx';
import { Text } from './Text';

export interface TextFieldProps extends Pick<
  TextInputProps,
  | 'value'
  | 'onChangeText'
  | 'onBlur'
  | 'onFocus'
  | 'onSubmitEditing'
  | 'placeholder'
  | 'keyboardType'
  | 'autoCapitalize'
  | 'autoComplete'
  | 'autoCorrect'
  | 'textContentType'
  | 'returnKeyType'
  | 'maxLength'
  | 'secureTextEntry'
  | 'editable'
  | 'autoFocus'
> {
  label: string;
  /** Help under the field. Replaced by `error` while there is one. */
  hint?: string;
  /** What is wrong, in words, shown in red next to the field it belongs to. */
  error?: string;
  /** Something fixed before the text, such as the phone field's country button. */
  leading?: ReactNode;
  className?: string;
}

/** A labelled single-line input: hairline border, ink border while focused, red with its message when invalid. */
export function TextField({
  label,
  hint,
  error,
  leading,
  className,
  editable = true,
  onBlur,
  onFocus,
  ...input
}: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View className={className}>
      <Text className="mb-1.5 pl-1 text-xs font-manrope-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {label}
      </Text>
      <View
        className={cx(
          'min-h-[56px] flex-row items-center rounded-2xl border bg-white px-4 dark:bg-slate-900',
          error
            ? 'border-red-500'
            : focused
              ? 'border-slate-950 dark:border-white'
              : 'border-slate-200 dark:border-slate-700',
          !editable && 'opacity-50',
        )}
      >
        {leading}
        <TextInput
          {...input}
          editable={editable}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={colors.placeholder}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          className="font-manrope-semibold min-h-[48px] flex-1 py-3 text-base text-slate-950 dark:text-white"
        />
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          className="mt-1.5 pl-1 text-xs font-manrope-semibold text-red-600 dark:text-red-500"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text className="mt-1.5 pl-1 text-xs text-slate-400">{hint}</Text>
      ) : null}
    </View>
  );
}
