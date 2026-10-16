import type {
  FareEstimateBody,
  FareQuote,
  GeoAutocompleteQuery,
  GeoAutocompleteResponse,
  GeoPlace,
  GeoPlaceResponse,
  GeoRoute,
  GeoRouteResponse,
  GeoSuggestion,
  LatLng,
} from '@taxikosmos/core';

import type { ApiClient } from '../client';

const point = ({ lat, lng }: LatLng) => `${lat},${lng}`;

export function geoApi(client: ApiClient) {
  return {
    /** Address suggestions while typing. Pass the same `session` for every keystroke of one search and for the final `place` call. */
    async autocomplete(query: GeoAutocompleteQuery, signal?: AbortSignal): Promise<GeoSuggestion[]> {
      return (
        await client.get<GeoAutocompleteResponse>('/geo/autocomplete', {
          query: { q: query.q, lat: query.lat, lng: query.lng, session: query.session },
          signal,
        })
      ).data.suggestions;
    },

    /** The coordinates and address of a chosen suggestion. */
    async place(placeId: string, session?: string, signal?: AbortSignal): Promise<GeoPlace> {
      return (
        await client.get<GeoPlaceResponse>(`/geo/places/${encodeURIComponent(placeId)}`, { query: { session }, signal })
      ).data.place;
    },

    /** The address under a map pin. */
    async reverse(location: LatLng, signal?: AbortSignal): Promise<GeoPlace> {
      return (
        await client.get<GeoPlaceResponse>('/geo/reverse', { query: { lat: location.lat, lng: location.lng }, signal })
      ).data.place;
    },

    async route(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<GeoRoute> {
      return (await client.get<GeoRouteResponse>('/geo/route', { query: { from: point(from), to: point(to) }, signal }))
        .data.route;
    },
  };
}

export function faresApi(client: ApiClient) {
  return {
    /** A price per vehicle class for a trip. The `quote_id` is what the trip request refers to. */
    async estimate(body: FareEstimateBody, signal?: AbortSignal): Promise<FareQuote> {
      return (await client.post<FareQuote>('/trips/fare-estimate', { body, signal })).data;
    },
  };
}
