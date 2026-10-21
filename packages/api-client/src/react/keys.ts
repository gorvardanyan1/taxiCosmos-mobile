import type { LatLng } from '@taxikosmos/core';

/** One place for every cache key, so a write knows exactly which reads it makes stale. */
export const queryKeys = {
  appConfig: (app: string, platform: string, version: string | undefined) =>
    ['app-config', app, platform, version ?? null] as const,
  me: ['me'] as const,
  savedPlaces: {
    all: ['saved-places'] as const,
    list: () => ['saved-places', 'list'] as const,
    detail: (id: number) => ['saved-places', 'detail', id] as const,
  },
  support: {
    all: ['support-tickets'] as const,
    list: (page: number) => ['support-tickets', 'list', page] as const,
    detail: (id: number) => ['support-tickets', 'detail', id] as const,
  },
  driver: {
    vehicles: ['driver', 'vehicles'] as const,
    bankAccounts: ['driver', 'bank-accounts'] as const,
    documents: ['driver', 'documents'] as const,
  },
  geo: {
    autocomplete: (q: string, near: Partial<LatLng> | undefined, session: string | undefined) =>
      ['geo', 'autocomplete', q, near?.lat ?? null, near?.lng ?? null, session ?? null] as const,
    reverse: (point: LatLng) => ['geo', 'reverse', point.lat, point.lng] as const,
    route: (from: LatLng, to: LatLng) => ['geo', 'route', from.lat, from.lng, to.lat, to.lng] as const,
  },
};
