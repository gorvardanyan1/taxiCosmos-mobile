import type { AppEnvironment } from './environment.ts';

/** The two apps in this monorepo. Each is its own Expo/EAS project with its own store listing. */
export type AppName = 'rider' | 'driver';

export interface AppIdentity {
  app: AppName;
  /** Name under the icon. */
  name: string;
  /** EAS project slug; the same for every environment of one app. */
  slug: string;
  /** Deep-link scheme, e.g. `taxirider://trip/42`. */
  scheme: string;
  /** iOS bundle identifier. */
  bundleIdentifier: string;
  /** Android application id. */
  androidPackage: string;
}

const BASE: Record<AppName, Omit<AppIdentity, 'app'>> = {
  rider: {
    name: 'TaxiKosmos',
    slug: 'taxikosmos-rider',
    scheme: 'taxirider',
    bundleIdentifier: 'com.taxikosmos.rider',
    androidPackage: 'com.taxikosmos.rider',
  },
  driver: {
    name: 'TaxiKosmos Driver',
    slug: 'taxikosmos-driver',
    scheme: 'taxidriver',
    bundleIdentifier: 'com.taxikosmos.driver',
    androidPackage: 'com.taxikosmos.driver',
  },
};

/** Suffixes that let development and staging builds sit next to the store app on one phone, each with its own deep links. */
const VARIANT: Record<AppEnvironment, { label: string; suffix: string } | null> = {
  development: { label: 'Dev', suffix: 'dev' },
  staging: { label: 'Staging', suffix: 'staging' },
  production: null,
};

export function appIdentity(app: AppName, environment: AppEnvironment): AppIdentity {
  const base = BASE[app];
  const variant = VARIANT[environment];

  if (variant === null) {
    return { app, ...base };
  }

  return {
    app,
    name: `${base.name} (${variant.label})`,
    slug: base.slug,
    scheme: `${base.scheme}-${variant.suffix}`,
    bundleIdentifier: `${base.bundleIdentifier}.${variant.suffix}`,
    androidPackage: `${base.androidPackage}.${variant.suffix}`,
  };
}
