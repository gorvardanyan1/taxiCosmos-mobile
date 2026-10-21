import type { ApiClient } from '../client';
import { devicesApi, meApi, savedPlacesApi } from './account';
import { appConfigApi } from './config';
import { authApi } from './auth';
import { driverApi } from './driver';
import { faresApi, geoApi } from './maps';
import { supportApi } from './support';

/** Every `/api/v1` endpoint the apps use today, as typed functions. Backend tasks still to come add theirs here. */
export function createApi(client: ApiClient) {
  return {
    appConfig: appConfigApi(client),
    auth: authApi(client),
    me: meApi(client),
    savedPlaces: savedPlacesApi(client),
    devices: devicesApi(client),
    geo: geoApi(client),
    fares: faresApi(client),
    support: supportApi(client),
    driver: driverApi(client),
  };
}

export type Api = ReturnType<typeof createApi>;
