import { APP_ENVIRONMENTS } from '../environment.ts';
import { appIdentity, type AppName } from '../identity.ts';

describe('appIdentity', () => {
  it('gives the store apps their own bundle ids and the taxirider:// / taxidriver:// schemes', () => {
    expect(appIdentity('rider', 'production')).toEqual({
      app: 'rider',
      name: 'TaxiKosmos',
      slug: 'taxikosmos-rider',
      scheme: 'taxirider',
      bundleIdentifier: 'com.taxikosmos.rider',
      androidPackage: 'com.taxikosmos.rider',
    });
    expect(appIdentity('driver', 'production')).toEqual({
      app: 'driver',
      name: 'TaxiKosmos Driver',
      slug: 'taxikosmos-driver',
      scheme: 'taxidriver',
      bundleIdentifier: 'com.taxikosmos.driver',
      androidPackage: 'com.taxikosmos.driver',
    });
  });

  it('suffixes development and staging builds so they install next to the store app', () => {
    expect(appIdentity('driver', 'development')).toMatchObject({
      name: 'TaxiKosmos Driver (Dev)',
      slug: 'taxikosmos-driver',
      scheme: 'taxidriver-dev',
      bundleIdentifier: 'com.taxikosmos.driver.dev',
      androidPackage: 'com.taxikosmos.driver.dev',
    });
    expect(appIdentity('rider', 'staging')).toMatchObject({
      name: 'TaxiKosmos (Staging)',
      scheme: 'taxirider-staging',
      bundleIdentifier: 'com.taxikosmos.rider.staging',
    });
  });

  it('never gives two builds the same bundle id, package or scheme', () => {
    const all = (['rider', 'driver'] as AppName[]).flatMap((app) =>
      APP_ENVIRONMENTS.map((env) => appIdentity(app, env)),
    );

    for (const field of ['bundleIdentifier', 'androidPackage', 'scheme'] as const) {
      expect(new Set(all.map((identity) => identity[field])).size).toBe(all.length);
    }
  });
});
