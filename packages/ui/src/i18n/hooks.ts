import { formatDate, formatMoney, type DateInput, type DateStyle, type Money } from '@taxikosmos/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from './LocaleProvider';

/** `t()` for the UI kit's strings (`t('phone.invalid')`). */
export function useUiTranslation() {
  return useTranslation('ui');
}

/** Money and dates in the language the person picked. Money arrives as integer minor units and is formatted only here. */
export function useFormat() {
  const { locale } = useLocale();

  return useMemo(
    () => ({
      locale,
      money: (money: Money) => formatMoney(money, locale),
      date: (value: DateInput, style: DateStyle = 'date') => formatDate(value, locale, style),
    }),
    [locale],
  );
}
