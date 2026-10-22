import { useGeoAutocomplete, useDebouncedValue, useResolvePlace } from '@taxikosmos/api-client';
import {
  getApiError,
  newIdempotencyKey,
  toAddressPoint,
  type AddressPoint,
  type GeoSuggestion,
  type LatLng,
} from '@taxikosmos/core';
import { useState } from 'react';

/** One request per pause in typing, not one per key. */
export const SEARCH_DEBOUNCE_MS = 300;

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'offline' | 'failed';

/**
 * Address search as the person types. Requests wait for a 300 ms pause, and every request of one search (and the final lookup of the chosen
 * place) carries the same session token, so the provider counts it as one search. A new search starts a new token. Choosing a suggestion gives
 * the same `{lat, lng, address}` that booking and saved places use.
 */
export function useAddressSearch(near: LatLng | null) {
  const [text, setText] = useState('');
  const [session, setSession] = useState<string | null>(null);
  // The suggestion that was chosen: its text stays in the box and the list closes until the person types again.
  const [chosen, setChosen] = useState<string | null>(null);
  const debounced = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);
  // Cleared text must stop the search at once, not 300 ms later when the debounce catches up.
  const query = text.trim() === '' || chosen !== null ? '' : debounced;
  const autocomplete = useGeoAutocomplete({
    q: query,
    ...(near ? { near } : {}),
    ...(session ? { session } : {}),
  });
  const resolve = useResolvePlace();

  const change = (next: string) => {
    setChosen(null);
    setText(next);

    if (next.trim() === '') {
      setSession(null);
    } else if (session === null) {
      setSession(newIdempotencyKey());
    }
  };

  const choose = async (suggestion: GeoSuggestion): Promise<AddressPoint | null> => {
    try {
      const place = await resolve.mutateAsync({ placeId: suggestion.place_id, ...(session ? { session } : {}) });
      setChosen(suggestion.text);
      setText(suggestion.text);
      setSession(null);

      return toAddressPoint(place);
    } catch {
      return null;
    }
  };

  const failure = autocomplete.isError ? autocomplete.error : null;
  const searching = query.trim().length >= 2;
  const status: SearchStatus = !searching
    ? 'idle'
    : failure !== null
      ? ['network', 'timeout'].includes(getApiError(failure)?.kind ?? '')
        ? 'offline'
        : 'failed'
      : autocomplete.data === undefined
        ? 'loading'
        : autocomplete.data.length === 0
          ? 'empty'
          : 'ready';

  return {
    text,
    change,
    clear: () => change(''),
    suggestions: searching && failure === null ? (autocomplete.data ?? []) : [],
    status,
    retry: () => void autocomplete.refetch(),
    choose,
    /** The lookup of the tapped suggestion is running or failed. */
    choosing: resolve.isPending,
    chooseFailed: resolve.isError,
    session,
  };
}
