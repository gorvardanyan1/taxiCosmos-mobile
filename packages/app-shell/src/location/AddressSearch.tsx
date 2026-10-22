import type { AddressPoint, LatLng } from '@taxikosmos/core';
import { Button, Icon, IconButton, Text, TextField, useUiTranslation } from '@taxikosmos/ui';
import { Pressable, View } from 'react-native';

import { useAddressSearch } from './useAddressSearch';

export interface AddressSearchProps {
  /** Rank suggestions near here (the phone's position, when it is known). */
  near: LatLng | null;
  /** The person chose a suggestion. */
  onSelect: (point: AddressPoint) => void;
}

/** The address box: suggestions after a short pause in typing, a message for every way the search can fail, and the chosen place as `{lat, lng, address}`. */
export function AddressSearch({ near, onSelect }: AddressSearchProps) {
  const { t } = useUiTranslation();
  const search = useAddressSearch(near);

  return (
    <View className="gap-2">
      <View className="flex-row items-end gap-2">
        <TextField
          className="flex-1"
          label={t('location.searchLabel')}
          placeholder={t('location.searchPlaceholder')}
          value={search.text}
          onChangeText={search.change}
          autoCorrect={false}
          returnKeyType="search"
          editable={!search.choosing}
          leading={<Icon name="search" size={18} />}
        />
        {search.text !== '' ? (
          <IconButton icon="close" label={t('location.clearSearch')} onPress={search.clear} className="mb-1" />
        ) : null}
      </View>
      <Results search={search} onSelect={onSelect} />
    </View>
  );
}

function Results({
  search,
  onSelect,
}: {
  search: ReturnType<typeof useAddressSearch>;
  onSelect: AddressSearchProps['onSelect'];
}) {
  const { t } = useUiTranslation();

  if (search.chooseFailed && !search.choosing) {
    return <Notice text={t('location.searchFailed')} />;
  }

  if (search.status === 'offline' || search.status === 'failed') {
    return (
      <View className="gap-2">
        <Notice text={search.status === 'offline' ? t('location.searchOffline') : t('location.searchFailed')} />
        <Button size="sm" variant="ghost" label={t('common.retry')} onPress={search.retry} />
      </View>
    );
  }

  if (search.status === 'loading') {
    return <Notice text={t('common.loading')} polite />;
  }

  if (search.status === 'empty') {
    return <Notice text={t('location.noResults')} />;
  }

  if (search.suggestions.length === 0) {
    return null;
  }

  return (
    <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      {search.suggestions.map((suggestion, index) => (
        <Pressable
          key={suggestion.place_id}
          accessibilityRole="button"
          accessibilityLabel={suggestion.text}
          disabled={search.choosing}
          onPress={async () => {
            const point = await search.choose(suggestion);

            if (point !== null) {
              onSelect(point);
            }
          }}
          className={`min-h-[56px] justify-center px-4 py-2 active:bg-slate-50 dark:active:bg-slate-800 ${
            index > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''
          }`}
        >
          <Text className="text-sm font-manrope-bold text-slate-950 dark:text-white">{suggestion.primary_text}</Text>
          {suggestion.secondary_text ? (
            <Text className="text-xs text-slate-500 dark:text-slate-400">{suggestion.secondary_text}</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

function Notice({ text, polite = false }: { text: string; polite?: boolean }) {
  return (
    <Text
      accessibilityRole={polite ? undefined : 'alert'}
      accessibilityLiveRegion={polite ? 'polite' : undefined}
      className="px-1 text-sm text-slate-500 dark:text-slate-400"
    >
      {text}
    </Text>
  );
}
