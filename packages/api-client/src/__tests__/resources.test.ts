import { getApiError } from '@taxikosmos/core';
import * as fixtures from '@taxikosmos/core/fixtures';

import { createApi, type Api } from '../resources';
import { documentForm } from '../resources/driver';
import { createMemoryTokenStore } from '../storage';
import { empty, makeClient, ok, replyWith, type Reply } from './helpers';

interface Case {
  name: string;
  call: (api: Api) => Promise<unknown>;
  reply: Reply;
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  /** What the call resolves to. */
  result: unknown;
  /** The endpoint is called without a bearer token. */
  anonymous?: boolean;
}

const point = { lat: 40.18, lng: 44.51 };

const cases: Case[] = [
  // ---- sign-in (the tokens are checked in the session tests below) ----
  {
    name: 'auth.requestOtp',
    call: (api) => api.auth.requestOtp({ phone: '+37491770058', app: 'rider' }),
    reply: replyWith(fixtures.authOtpRequested),
    method: 'POST',
    path: '/auth/otp/request',
    body: { phone: '+37491770058', app: 'rider' },
    result: fixtures.authOtpRequested.body,
    anonymous: true,
  },
  {
    name: 'auth.verifyOtp',
    call: (api) =>
      api.auth.verifyOtp({
        phone: '+37491770058',
        code: '123456',
        app: 'rider',
        device_id: 'device-0001',
        locale: 'en',
      }),
    reply: replyWith(fixtures.authSessionRider),
    method: 'POST',
    path: '/auth/otp/verify',
    body: { phone: '+37491770058', code: '123456', app: 'rider', device_id: 'device-0001', locale: 'en' },
    result: fixtures.authSessionRider.body,
    anonymous: true,
  },
  {
    name: 'auth.loginWithSocial',
    call: (api) => api.auth.loginWithSocial('apple', { token: 'apple-token', app: 'driver', device_id: 'device-0001' }),
    reply: replyWith(fixtures.authSessionDriver),
    method: 'POST',
    path: '/auth/social/apple',
    body: { token: 'apple-token', app: 'driver', device_id: 'device-0001' },
    result: fixtures.authSessionDriver.body,
    anonymous: true,
  },
  {
    name: 'auth.verifyPhone',
    call: (api) => api.auth.verifyPhone({ phone: '+37491770058', code: '123456' }),
    reply: replyWith(fixtures.authSessionRider),
    method: 'POST',
    path: '/auth/phone/verify',
    body: { phone: '+37491770058', code: '123456' },
    result: fixtures.authSessionRider.body,
  },
  // ---- the signed-in person ----
  {
    name: 'me.get',
    call: (api) => api.me.get(),
    reply: replyWith(fixtures.meRider),
    method: 'GET',
    path: '/me',
    result: fixtures.meRider.body.user,
  },
  {
    name: 'me.update',
    call: (api) => api.me.update({ name: 'Fixture Rider', locale: 'ru' }),
    reply: replyWith(fixtures.meRiderUpdated),
    method: 'PATCH',
    path: '/me',
    body: { name: 'Fixture Rider', locale: 'ru' },
    result: fixtures.meRiderUpdated.body.user,
  },
  {
    name: 'me.requestPhoneChange',
    call: (api) => api.me.requestPhoneChange({ phone: '+37491770059' }),
    reply: replyWith(fixtures.authOtpRequested),
    method: 'POST',
    path: '/me/phone/request',
    body: { phone: '+37491770059' },
    result: fixtures.authOtpRequested.body,
  },
  {
    name: 'me.verifyPhoneChange',
    call: (api) => api.me.verifyPhoneChange({ phone: '+37491770059', code: '123456' }),
    reply: replyWith(fixtures.meRider),
    method: 'POST',
    path: '/me/phone/verify',
    body: { phone: '+37491770059', code: '123456' },
    result: fixtures.meRider.body.user,
  },
  // ---- saved places ----
  {
    name: 'savedPlaces.list',
    call: (api) => api.savedPlaces.list(),
    reply: replyWith(fixtures.savedPlacesList),
    method: 'GET',
    path: '/saved-places',
    result: fixtures.savedPlacesList.body.data,
  },
  {
    name: 'savedPlaces.get',
    call: (api) => api.savedPlaces.get(1),
    reply: replyWith(fixtures.savedPlacesShow),
    method: 'GET',
    path: '/saved-places/1',
    result: fixtures.savedPlacesShow.body.data,
  },
  {
    name: 'savedPlaces.create',
    call: (api) => api.savedPlaces.create({ label: 'home', name: 'Home', address: 'Abovyan St 1, Yerevan', ...point }),
    reply: replyWith(fixtures.savedPlacesCreated),
    method: 'POST',
    path: '/saved-places',
    body: { label: 'home', name: 'Home', address: 'Abovyan St 1, Yerevan', ...point },
    result: fixtures.savedPlacesCreated.body.data,
  },
  {
    name: 'savedPlaces.update',
    call: (api) => api.savedPlaces.update(1, { name: 'Flat' }),
    reply: replyWith(fixtures.savedPlacesShow),
    method: 'PATCH',
    path: '/saved-places/1',
    body: { name: 'Flat' },
    result: fixtures.savedPlacesShow.body.data,
  },
  {
    name: 'savedPlaces.remove',
    call: (api) => api.savedPlaces.remove(1),
    reply: empty(),
    method: 'DELETE',
    path: '/saved-places/1',
    result: undefined,
  },
  // ---- devices ----
  {
    name: 'devices.register',
    call: (api) =>
      api.devices.register({
        push_token: 'ExponentPushToken[fixtureRiderToken01]',
        platform: 'android',
        locale: 'en',
        app_version: '0.1.0',
      }),
    reply: replyWith(fixtures.devicesRegistered),
    method: 'POST',
    path: '/devices',
    body: {
      push_token: 'ExponentPushToken[fixtureRiderToken01]',
      platform: 'android',
      locale: 'en',
      app_version: '0.1.0',
    },
    result: fixtures.devicesRegistered.body.device,
  },
  {
    name: 'devices.unregister',
    call: (api) => api.devices.unregister(4),
    reply: empty(),
    method: 'DELETE',
    path: '/devices/4',
    result: undefined,
  },
  // ---- maps and fares ----
  {
    name: 'geo.autocomplete',
    call: (api) => api.geo.autocomplete({ q: 'Abovyan', lat: 40.18, lng: 44.51, session: 'search-1' }),
    reply: replyWith(fixtures.geoAutocomplete),
    method: 'GET',
    path: '/geo/autocomplete',
    query: { q: 'Abovyan', lat: '40.18', lng: '44.51', session: 'search-1' },
    result: fixtures.geoAutocomplete.body.suggestions,
  },
  {
    name: 'geo.autocomplete (no position)',
    call: (api) => api.geo.autocomplete({ q: 'Aba' }),
    reply: replyWith(fixtures.geoAutocomplete),
    method: 'GET',
    path: '/geo/autocomplete',
    query: { q: 'Aba' },
    result: fixtures.geoAutocomplete.body.suggestions,
  },
  {
    name: 'geo.place',
    call: (api) => api.geo.place('fake-abovyan-1', 'search-1'),
    reply: replyWith(fixtures.geoPlace),
    method: 'GET',
    path: '/geo/places/fake-abovyan-1',
    query: { session: 'search-1' },
    result: fixtures.geoPlace.body.place,
  },
  {
    name: 'geo.reverse',
    call: (api) => api.geo.reverse(point),
    reply: replyWith(fixtures.geoReverse),
    method: 'GET',
    path: '/geo/reverse',
    query: { lat: '40.18', lng: '44.51' },
    result: fixtures.geoReverse.body.place,
  },
  {
    name: 'geo.route',
    call: (api) => api.geo.route(point, { lat: 40.2, lng: 44.53 }),
    reply: replyWith(fixtures.geoRoute),
    method: 'GET',
    path: '/geo/route',
    query: { from: '40.18,44.51', to: '40.2,44.53' },
    result: fixtures.geoRoute.body.route,
  },
  {
    name: 'fares.estimate',
    call: (api) => api.fares.estimate({ pickup: point, dropoff: { lat: 40.2, lng: 44.53 } }),
    reply: replyWith(fixtures.fareEstimate),
    method: 'POST',
    path: '/trips/fare-estimate',
    body: { pickup: point, dropoff: { lat: 40.2, lng: 44.53 } },
    result: fixtures.fareEstimate.body,
  },
  // ---- support ----
  {
    name: 'support.list',
    call: (api) => api.support.list(2),
    reply: replyWith(fixtures.supportTicketList),
    method: 'GET',
    path: '/support-tickets',
    query: { page: '2' },
    result: fixtures.supportTicketList.body,
  },
  {
    name: 'support.get',
    call: (api) => api.support.get(1),
    reply: replyWith(fixtures.supportTicketShow),
    method: 'GET',
    path: '/support-tickets/1',
    result: fixtures.supportTicketShow.body.data,
  },
  {
    name: 'support.create',
    call: (api) => api.support.create({ category: 'fare', subject: 'Question about my fare', message: 'Why?' }),
    reply: replyWith(fixtures.supportTicketCreated),
    method: 'POST',
    path: '/support-tickets',
    body: { category: 'fare', subject: 'Question about my fare', message: 'Why?' },
    result: fixtures.supportTicketCreated.body.data,
  },
  {
    name: 'support.addMessage',
    call: (api) => api.support.addMessage(1, { body: 'Any update?' }),
    reply: replyWith(fixtures.supportMessageCreated),
    method: 'POST',
    path: '/support-tickets/1/messages',
    body: { body: 'Any update?' },
    result: fixtures.supportMessageCreated.body.data,
  },
  // ---- driver ----
  {
    name: 'driver.apply',
    call: (api) => api.driver.apply(),
    reply: replyWith(fixtures.driverApplication),
    method: 'POST',
    path: '/driver/application',
    result: fixtures.driverApplication.body.data,
  },
  {
    name: 'driver.saveProfile',
    call: (api) => api.driver.saveProfile({ license_number: 'FIX-12345', license_expiry: '2027-11-20' }),
    reply: replyWith(fixtures.driverProfile),
    method: 'PUT',
    path: '/driver/profile',
    body: { license_number: 'FIX-12345', license_expiry: '2027-11-20' },
    result: fixtures.driverProfile.body.data,
  },
  {
    name: 'driver.vehicles.list',
    call: (api) => api.driver.vehicles.list(),
    reply: replyWith(fixtures.driverVehicles),
    method: 'GET',
    path: '/driver/vehicles',
    result: fixtures.driverVehicles.body.data,
  },
  {
    name: 'driver.vehicles.create',
    call: (api) =>
      api.driver.vehicles.create({
        make: 'Toyota',
        model: 'Camry',
        year: 2021,
        color: 'Silver',
        plate_number: 'FIX 123',
        vehicle_class: 'economy',
      }),
    reply: replyWith(fixtures.driverVehicleCreated),
    method: 'POST',
    path: '/driver/vehicles',
    body: {
      make: 'Toyota',
      model: 'Camry',
      year: 2021,
      color: 'Silver',
      plate_number: 'FIX 123',
      vehicle_class: 'economy',
    },
    result: fixtures.driverVehicleCreated.body.data,
  },
  {
    name: 'driver.vehicles.update',
    call: (api) => api.driver.vehicles.update(1, { color: 'Black' }),
    reply: replyWith(fixtures.driverVehicleCreated),
    method: 'PATCH',
    path: '/driver/vehicles/1',
    body: { color: 'Black' },
    result: fixtures.driverVehicleCreated.body.data,
  },
  {
    name: 'driver.vehicles.remove',
    call: (api) => api.driver.vehicles.remove(1),
    reply: empty(),
    method: 'DELETE',
    path: '/driver/vehicles/1',
    result: undefined,
  },
  {
    name: 'driver.bankAccounts.list',
    call: (api) => api.driver.bankAccounts.list(),
    reply: replyWith(fixtures.driverBankAccounts),
    method: 'GET',
    path: '/driver/bank-accounts',
    result: fixtures.driverBankAccounts.body.data,
  },
  {
    name: 'driver.bankAccounts.create',
    call: (api) =>
      api.driver.bankAccounts.create({
        account_holder: 'Fixture Driver',
        bank_name: 'Fixture Bank',
        account_number: 'AM00FIXTURE000123',
        swift: 'FIXTAM22',
      }),
    reply: replyWith(fixtures.driverBankAccountCreated),
    method: 'POST',
    path: '/driver/bank-accounts',
    body: {
      account_holder: 'Fixture Driver',
      bank_name: 'Fixture Bank',
      account_number: 'AM00FIXTURE000123',
      swift: 'FIXTAM22',
    },
    result: fixtures.driverBankAccountCreated.body.data,
  },
  {
    name: 'driver.bankAccounts.remove',
    call: (api) => api.driver.bankAccounts.remove(1),
    reply: empty(),
    method: 'DELETE',
    path: '/driver/bank-accounts/1',
    result: undefined,
  },
  {
    name: 'driver.documents.list',
    call: (api) => api.driver.documents.list(),
    reply: replyWith(fixtures.driverDocuments),
    method: 'GET',
    path: '/driver/documents',
    result: fixtures.driverDocuments.body,
  },
  {
    name: 'driver.setAvailability',
    call: (api) => api.driver.setAvailability({ availability: 'online' }),
    reply: ok({ availability: 'online' }),
    method: 'POST',
    path: '/driver/availability',
    body: { availability: 'online' },
    result: { availability: 'online' },
  },
  {
    name: 'driver.sendLocation',
    call: (api) => api.driver.sendLocation({ ...point, heading: 90, speed: 12.5 }),
    reply: ok({ recorded_at: '2026-10-16T07:31:28.123Z' }),
    method: 'POST',
    path: '/driver/location',
    body: { ...point, heading: 90, speed: 12.5 },
    result: { recorded_at: '2026-10-16T07:31:28.123Z' },
  },
];

describe.each(cases)('$name', ({ call, reply, method, path, query, body, result, anonymous }) => {
  it('sends the request the backend expects and returns the unwrapped answer', async () => {
    const { client, server } = makeClient([reply]);
    const answer = await call(createApi(client));
    const request = server.requests[0];

    expect(request).toMatchObject({ method, path });
    expect(request?.query).toEqual(query ?? {});
    expect(request?.body).toEqual(body);
    expect(request?.headers.authorization).toBe(anonymous ? undefined : 'Bearer access-1');
    expect(answer).toEqual(result);
  });

  it('throws the tagged error when the server refuses', async () => {
    const { client } = makeClient([replyWith(fixtures.errorValidation)]);
    const error = await call(createApi(client)).catch((e: unknown) => e);

    expect(getApiError(error)).toMatchObject({ kind: 'validation' });
  });
});

describe('sign-in calls start the session', () => {
  it('verifyOtp saves the tokens before it resolves, so the next call is already signed in', async () => {
    const tokens = createMemoryTokenStore(null);
    const { client, server } = makeClient([replyWith(fixtures.authSessionRider), replyWith(fixtures.meRider)], {
      tokens,
      signedIn: null,
    });
    const api = createApi(client);
    await api.auth.verifyOtp({ phone: '+37491770058', code: '123456', app: 'rider', device_id: 'device-0001' });
    await api.me.get();

    expect(await tokens.read()).toEqual({
      accessToken: '1|fixture-access-token',
      accessTokenExpiresAt: fixtures.authSessionRider.body.access_token_expires_at,
      refreshToken: 'fixture-refresh-token',
    });
    expect(server.requests[1]?.headers.authorization).toBe('Bearer 1|fixture-access-token');
  });

  it('a social sign-in does the same, and says when the phone is still missing', async () => {
    const tokens = createMemoryTokenStore(null);
    const { client } = makeClient([ok({ ...fixtures.authSessionRider.body, needs_phone: true })], {
      tokens,
      signedIn: null,
    });
    const session = await createApi(client).auth.loginWithSocial('google', {
      token: 't',
      app: 'rider',
      device_id: 'device-0001',
    });

    expect(session.needs_phone).toBe(true);
    expect(await tokens.read()).not.toBeNull();
  });

  it('a wrong code starts nothing', async () => {
    const tokens = createMemoryTokenStore(null);
    const { client } = makeClient([replyWith(fixtures.errorInvalidCode)], { tokens, signedIn: null });
    await createApi(client)
      .auth.verifyOtp({ phone: '+37491770058', code: '000000', app: 'rider', device_id: 'device-0001' })
      .catch(() => undefined);

    expect(await tokens.read()).toBeNull();
    expect(client.session.isSignedIn).toBe(false);
  });
});

describe('signing out', () => {
  it('tells the server and forgets the tokens', async () => {
    const { client, server, tokens } = makeClient([empty()]);
    await createApi(client).auth.logout();

    expect(server.requests[0]).toMatchObject({ method: 'POST', path: '/auth/logout' });
    expect(tokens.log).toContain('clear');
    expect(client.session.isSignedIn).toBe(false);
  });

  it('still signs out this device when the server cannot be reached', async () => {
    const { client, tokens } = makeClient(['network-error']);
    await createApi(client).auth.logout();

    expect(tokens.log).toContain('clear');
  });

  it('still signs out this device when the token was already dead', async () => {
    const { client, tokens } = makeClient([
      replyWith(fixtures.errorUnauthenticated),
      replyWith(fixtures.errorUnauthenticated),
    ]);
    await createApi(client).auth.logout();

    expect(tokens.log).toContain('clear');
  });

  it('"sign out everywhere" clears this device only once the server did it', async () => {
    const ok1 = makeClient([empty()]);
    await createApi(ok1.client).auth.logoutAll();
    expect(ok1.server.requests[0]).toMatchObject({ method: 'POST', path: '/auth/logout-all' });
    expect(ok1.client.session.isSignedIn).toBe(false);

    const failed = makeClient(['network-error']);
    await createApi(failed.client)
      .auth.logoutAll()
      .catch(() => undefined);
    expect(failed.tokens.log).not.toContain('clear');
    expect(failed.client.session.isSignedIn).toBe(true);
  });
});

describe('retry safety of the endpoints that honour the Idempotency-Key header', () => {
  it('support ticket creation retries a dropped connection with the same key and opens one ticket', async () => {
    const { client, server } = makeClient(['network-error', replyWith(fixtures.supportTicketCreated)]);
    const ticket = await createApi(client).support.create(
      { category: 'fare', subject: 'Question about my fare', message: 'Why?' },
      'ticket:draft-1',
    );

    expect(ticket.code).toBe('TKT-00001');
    expect(server.requests).toHaveLength(2);
    expect(server.requests[1]?.headers['idempotency-key']).toBe(server.requests[0]?.headers['idempotency-key']);
  });

  it('other writes do not retry by themselves', async () => {
    const { client, server } = makeClient(['network-error']);
    await createApi(client)
      .driver.vehicles.create({
        make: 'Toyota',
        model: 'Camry',
        year: 2021,
        color: 'Silver',
        plate_number: 'FIX 123',
        vehicle_class: 'economy',
      })
      .catch(() => undefined);

    expect(server.requests).toHaveLength(1);
  });
});

describe('document upload', () => {
  const upload = {
    type: 'license',
    file: { uri: 'file:///cache/license.jpg', name: 'license.jpg', type: 'image/jpeg' },
    expires_at: '2027-11-20',
    document_number: 'FIX-12345',
  } as const;

  it('sends the file and its details as multipart with the longer time limit', async () => {
    const { client, server } = makeClient([replyWith(fixtures.driverDocumentCreated)]);
    const document = await createApi(client).driver.documents.upload(upload);
    const form = server.requests[0]?.body as FormData;

    expect(document).toEqual(fixtures.driverDocumentCreated.body.data);
    expect(server.requests[0]).toMatchObject({ method: 'POST', path: '/driver/documents' });
    expect(server.requests[0]?.headers['content-type']).toBeUndefined();
    expect(form.get('type')).toBe('license');
    expect(form.get('expires_at')).toBe('2027-11-20');
    expect(form.get('document_number')).toBe('FIX-12345');
    expect(form.has('file')).toBe(true);
  });

  it('leaves out the details that were not given, and sends a vehicle id when there is one', () => {
    const bare = documentForm({ type: 'insurance', file: upload.file });
    const forVehicle = documentForm({ type: 'vehicle_registration', file: upload.file, vehicle_id: 7 });

    expect([...bare.keys()].sort()).toEqual(['file', 'type']);
    expect(forVehicle.get('vehicle_id')).toBe('7');
  });

  it('is not repeated once the server accepted it, even if the screen asks again (operation)', async () => {
    const { client, server } = makeClient([replyWith(fixtures.driverDocumentCreated)]);
    const api = createApi(client);
    await api.driver.documents.upload(upload, 'upload:license:1');
    const again = await api.driver.documents.upload(upload, 'upload:license:1');

    expect(server.requests).toHaveLength(1);
    expect(again).toEqual(fixtures.driverDocumentCreated.body.data);
  });
});

describe('the place id in the path', () => {
  it('is encoded, so an odd id cannot change the route', async () => {
    const { client, server } = makeClient([replyWith(fixtures.geoPlace)]);
    await createApi(client).geo.place('a/b?c=d');

    expect(server.requests[0]?.path).toBe('/geo/places/a%2Fb%3Fc%3Dd');
    expect(server.requests[0]?.query).toEqual({});
  });
});

describe('time limits: a slow connection must not hold a screen for ever', () => {
  const point = { lat: 40.18, lng: 44.51 };
  const upload = {
    type: 'license',
    file: { uri: 'file:///license.jpg', name: 'license.jpg', type: 'image/jpeg' },
  } as const;

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** Starts the call against a server that never answers and reports when it ends. */
  async function race(call: (api: Api) => Promise<unknown>, limitMs: number) {
    const { client, tokens } = makeClient(['hang']);
    let ended: unknown = 'running';
    void call(createApi(client)).then(
      () => (ended = 'resolved'),
      (error: unknown) => (ended = getApiError(error)?.kind ?? 'other'),
    );
    await jest.advanceTimersByTimeAsync(limitMs - 1);
    const beforeLimit = ended;
    await jest.advanceTimersByTimeAsync(2);

    return { beforeLimit, atLimit: ended, tokens };
  }

  it('a document upload waits up to 60 seconds (a photo on a poor connection), then reports a timeout', async () => {
    expect(await race((api) => api.driver.documents.upload(upload), 60_000)).toMatchObject({
      beforeLimit: 'running',
      atLimit: 'timeout',
    });
  });

  it('a location report gives up after 8 seconds: the next position is coming, an old one is worth nothing', async () => {
    expect(await race((api) => api.driver.sendLocation(point), 8_000)).toMatchObject({
      beforeLimit: 'running',
      atLimit: 'timeout',
    });
  });

  it('signing out stops waiting for the server after 5 seconds and signs out anyway', async () => {
    const result = await race((api) => api.auth.logout(), 5_000);

    expect(result).toMatchObject({ beforeLimit: 'running', atLimit: 'resolved' });
    expect(result.tokens.log).toContain('clear');
  });
});
