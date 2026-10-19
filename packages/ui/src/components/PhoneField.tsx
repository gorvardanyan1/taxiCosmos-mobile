import { dialCodeFor, formatPhoneInput, type CountryCode } from '@taxikosmos/core';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useUiTranslation } from '../i18n/hooks';
import { Icon } from '../icons/Icon';
import { BottomSheet } from './BottomSheet';
import { cx } from './cx';
import { ListGroup } from './ListGroup';
import { Text } from './Text';
import { TextField } from './TextField';
import { useTheme } from '../theme/ThemeProvider';

/** The countries the apps offer, Armenia (the launch market) first. Names come from the `countries` translations. */
export const PHONE_COUNTRIES: readonly CountryCode[] = ['AM', 'RU', 'GE', 'UA', 'KZ', 'BY', 'US'];

export interface PhoneFieldChange {
  /** The text as it should now appear in the field, formatted while typing (`091 234567`). */
  text: string;
  country: CountryCode;
  /** The number in E.164 once it is complete and valid, else `null`. This is the only form that leaves the app. */
  e164: string | null;
  valid: boolean;
}

export interface PhoneFieldProps {
  /** The text shown in the field (controlled). */
  value: string;
  country: CountryCode;
  onChange: (change: PhoneFieldChange) => void;
  /** A message from outside (the server rejected the number); it wins over the field's own check. */
  error?: string;
  countries?: readonly CountryCode[];
  editable?: boolean;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  className?: string;
}

/** Phone entry with a country picker. It formats as the person types and reports E.164, and says "invalid" only after they leave the field. */
export function PhoneField({
  value,
  country,
  onChange,
  error,
  countries = PHONE_COUNTRIES,
  editable = true,
  autoFocus,
  onSubmitEditing,
  className,
}: PhoneFieldProps) {
  const { t } = useUiTranslation();
  const { colors } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [left, setLeft] = useState(false);
  const state = formatPhoneInput(value, country);
  const ownError = left && value.trim() !== '' && !state.valid ? t('phone.invalid') : undefined;
  const countryName = t(`countries.${country}`);

  const change = (text: string, nextCountry: CountryCode) => {
    const next = formatPhoneInput(text, nextCountry);
    onChange({ text: next.formatted, country: nextCountry, e164: next.e164, valid: next.valid });
  };

  return (
    <>
      <TextField
        className={className}
        label={t('phone.label')}
        value={value}
        error={error ?? ownError}
        editable={editable}
        autoFocus={autoFocus}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        onChangeText={(text) => change(text, country)}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setLeft(false)}
        onBlur={() => setLeft(true)}
        leading={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('phone.country', { name: countryName, code: dialCodeFor(country) })}
            disabled={!editable}
            onPress={() => setPickerOpen(true)}
            className="mr-3 min-h-[44px] flex-row items-center gap-1 border-r border-slate-200 pr-3 dark:border-slate-700"
          >
            <Text className="text-base font-manrope-bold text-slate-950 dark:text-white">{dialCodeFor(country)}</Text>
            <Icon name="chevronDown" size={16} color={colors.iconMuted} />
          </Pressable>
        }
      />
      <BottomSheet visible={pickerOpen} title={t('phone.selectCountry')} onClose={() => setPickerOpen(false)}>
        <ListGroup>
          {countries.map((code) => {
            const selected = code === country;

            return (
              <Pressable
                key={code}
                accessibilityRole="button"
                accessibilityLabel={t('phone.country', { name: t(`countries.${code}`), code: dialCodeFor(code) })}
                accessibilityState={{ selected }}
                onPress={() => {
                  setPickerOpen(false);
                  change(value, code);
                }}
                className="min-h-[56px] flex-row items-center gap-3 p-4 active:bg-slate-50 dark:active:bg-slate-800"
              >
                <Text
                  className={cx(
                    'flex-1 text-sm text-slate-800 dark:text-slate-100',
                    selected ? 'font-manrope-extrabold' : 'font-manrope-bold',
                  )}
                >
                  {t(`countries.${code}`)}
                </Text>
                <Text className="text-sm font-manrope-semibold text-slate-400">{dialCodeFor(code)}</Text>
                {selected ? <Icon name="check" size={18} color={colors.success} /> : <View className="w-[18px]" />}
              </Pressable>
            );
          })}
        </ListGroup>
      </BottomSheet>
    </>
  );
}
