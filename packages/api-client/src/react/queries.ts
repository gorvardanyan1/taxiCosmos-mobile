import type {
  DriverBankAccount,
  DriverDocumentsResponse,
  DriverVehicle,
  GeoPlace,
  GeoRoute,
  GeoSuggestion,
  LatLng,
  Me,
  Paginated,
  SavedPlace,
  SupportTicket,
} from '@taxikosmos/core';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApi, useSessionStatus } from './context';
import { queryKeys } from './keys';

interface QueryOptions {
  /** Turn the query off (for example until a form field has a value). It never runs while signed out. */
  enabled?: boolean;
  /** Poll over REST every `refetchInterval` ms (see `usePollingInterval`). */
  refetchInterval?: number | false;
}

/** A read that waits for a signed-in session: nothing is requested before the saved session is read, or after sign-out. */
function useSignedIn(enabled = true): boolean {
  return useSessionStatus() === 'signed_in' && enabled;
}

export function useMe(options: QueryOptions = {}): UseQueryResult<Me> {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => api.me.get(signal),
    enabled: useSignedIn(options.enabled),
    refetchInterval: options.refetchInterval ?? false,
  });
}

export function useSavedPlaces(options: QueryOptions = {}): UseQueryResult<SavedPlace[]> {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.savedPlaces.list(),
    queryFn: ({ signal }) => api.savedPlaces.list(signal),
    enabled: useSignedIn(options.enabled),
  });
}

export function useSavedPlace(id: number | null, options: QueryOptions = {}): UseQueryResult<SavedPlace> {
  const api = useApi();
  const enabled = useSignedIn(options.enabled) && id !== null;

  return useQuery({
    queryKey: queryKeys.savedPlaces.detail(id ?? 0),
    queryFn: ({ signal }) => api.savedPlaces.get(id as number, signal),
    enabled,
  });
}

/** One page of the person's support tickets, newest first. The previous page stays on screen while the next loads. */
export function useSupportTickets(page = 1, options: QueryOptions = {}): UseQueryResult<Paginated<SupportTicket>> {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.support.list(page),
    queryFn: ({ signal }) => api.support.list(page, signal),
    enabled: useSignedIn(options.enabled),
    placeholderData: keepPreviousData,
  });
}

export function useSupportTicket(id: number | null, options: QueryOptions = {}): UseQueryResult<SupportTicket> {
  const api = useApi();
  const enabled = useSignedIn(options.enabled) && id !== null;

  return useQuery({
    queryKey: queryKeys.support.detail(id ?? 0),
    queryFn: ({ signal }) => api.support.get(id as number, signal),
    enabled,
    refetchInterval: options.refetchInterval ?? false,
  });
}

export function useDriverVehicles(options: QueryOptions = {}): UseQueryResult<DriverVehicle[]> {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.driver.vehicles,
    queryFn: ({ signal }) => api.driver.vehicles.list(signal),
    enabled: useSignedIn(options.enabled),
  });
}

export function useDriverBankAccounts(options: QueryOptions = {}): UseQueryResult<DriverBankAccount[]> {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.driver.bankAccounts,
    queryFn: ({ signal }) => api.driver.bankAccounts.list(signal),
    enabled: useSignedIn(options.enabled),
  });
}

/** The driver's documents and which required ones are still missing, pending, rejected (with the reason) or expired. */
export function useDriverDocuments(options: QueryOptions = {}): UseQueryResult<DriverDocumentsResponse> {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.driver.documents,
    queryFn: ({ signal }) => api.driver.documents.list(signal),
    enabled: useSignedIn(options.enabled),
    refetchInterval: options.refetchInterval ?? false,
  });
}

export interface AutocompleteInput {
  /** What was typed. Debounce it first (`useDebouncedValue`). Nothing is requested under two characters. */
  q: string;
  /** Rank suggestions near here. */
  near?: Partial<LatLng> | undefined;
  /** One token per search session, reused for the final `place` call. */
  session?: string | undefined;
}

export function useGeoAutocomplete(
  { q, near, session }: AutocompleteInput,
  options: QueryOptions = {},
): UseQueryResult<GeoSuggestion[]> {
  const api = useApi();
  const text = q.trim();
  const enabled = useSignedIn(options.enabled) && text.length >= 2;

  return useQuery({
    queryKey: queryKeys.geo.autocomplete(text, near, session),
    queryFn: ({ signal }) =>
      api.geo.autocomplete(
        {
          q: text,
          ...(near?.lat !== undefined && near.lng !== undefined ? { lat: near.lat, lng: near.lng } : {}),
          ...(session ? { session } : {}),
        },
        signal,
      ),
    enabled,
    // The list does not blink empty between two keystrokes; the same search is not paid for twice.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

/** The address under a pin. `null` waits until there is a pin. */
export function useGeoReverse(point: LatLng | null, options: QueryOptions = {}): UseQueryResult<GeoPlace> {
  const api = useApi();
  const enabled = useSignedIn(options.enabled) && point !== null;

  return useQuery({
    queryKey: queryKeys.geo.reverse(point ?? { lat: 0, lng: 0 }),
    queryFn: ({ signal }) => api.geo.reverse(point as LatLng, signal),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useGeoRoute(
  from: LatLng | null,
  to: LatLng | null,
  options: QueryOptions = {},
): UseQueryResult<GeoRoute> {
  const api = useApi();
  const enabled = useSignedIn(options.enabled) && from !== null && to !== null;

  return useQuery({
    queryKey: queryKeys.geo.route(from ?? { lat: 0, lng: 0 }, to ?? { lat: 0, lng: 0 }),
    queryFn: ({ signal }) => api.geo.route(from as LatLng, to as LatLng, signal),
    enabled,
    staleTime: 5 * 60_000,
  });
}
