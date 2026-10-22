import { ApiRequestError, fieldError, getApiError } from '@taxikosmos/core';
import * as fixtures from '@taxikosmos/core/fixtures';
import { act } from '@testing-library/react-native';

import {
  queryKeys,
  useAddSupportMessage,
  useApplyAsDriver,
  useCreateBankAccount,
  useCreateSavedPlace,
  useCreateSupportTicket,
  useCreateVehicle,
  useDeleteBankAccount,
  useDeleteSavedPlace,
  useDeleteVehicle,
  useDriverVehicles,
  useFareEstimate,
  useLogout,
  useLogoutAll,
  useMe,
  useRegisterDevice,
  useResolvePlace,
  useRequestOtp,
  useRequestPhoneChange,
  useSavedPlaces,
  useSaveDriverProfile,
  useSendDriverLocation,
  useSessionStatus,
  useSetAvailability,
  useSocialLogin,
  useSupportTickets,
  useUnregisterDevice,
  useUpdateMe,
  useUpdateSavedPlace,
  useUpdateVehicle,
  useUploadDriverDocument,
  useVerifyOtp,
  useVerifyPhone,
  useVerifyPhoneChange,
} from '..';
import { empty, ok, replyWith } from './helpers';
import { renderWithApi, waitFor } from './react-helpers';

const point = { lat: 40.18, lng: 44.51 };
const vehicle = {
  make: 'Toyota',
  model: 'Camry',
  year: 2021,
  color: 'Silver',
  plate_number: 'FIX 123',
  vehicle_class: 'economy',
} as const;
const upload = {
  type: 'license',
  file: { uri: 'file:///license.jpg', name: 'license.jpg', type: 'image/jpeg' },
} as const;

describe('every write sends the request the backend expects', () => {
  type Row = [
    string,
    () => { mutateAsync: (vars: never) => Promise<unknown> },
    unknown,
    ReturnType<typeof replyWith>,
    string,
    string,
    unknown,
  ];
  const rows: Row[] = [
    [
      'useRequestOtp',
      useRequestOtp as never,
      { phone: '+37491770058', app: 'rider' },
      replyWith(fixtures.authOtpRequested),
      'POST',
      '/auth/otp/request',
      { phone: '+37491770058', app: 'rider' },
    ],
    [
      'useVerifyOtp',
      useVerifyOtp as never,
      { phone: '+37491770058', code: '123456', app: 'rider', device_id: 'device-0001' },
      replyWith(fixtures.authSessionRider),
      'POST',
      '/auth/otp/verify',
      { phone: '+37491770058', code: '123456', app: 'rider', device_id: 'device-0001' },
    ],
    [
      'useSocialLogin',
      useSocialLogin as never,
      { provider: 'google', token: 'g-token', app: 'rider', device_id: 'device-0001' },
      replyWith(fixtures.authSessionRider),
      'POST',
      '/auth/social/google',
      { token: 'g-token', app: 'rider', device_id: 'device-0001' },
    ],
    [
      'useVerifyPhone',
      useVerifyPhone as never,
      { phone: '+37491770058', code: '123456' },
      replyWith(fixtures.authSessionRider),
      'POST',
      '/auth/phone/verify',
      { phone: '+37491770058', code: '123456' },
    ],
    [
      'useUpdateMe',
      useUpdateMe as never,
      { name: 'Fixture Rider', locale: 'ru' },
      replyWith(fixtures.meRiderUpdated),
      'PATCH',
      '/me',
      { name: 'Fixture Rider', locale: 'ru' },
    ],
    [
      'useRequestPhoneChange',
      useRequestPhoneChange as never,
      { phone: '+37491770059' },
      replyWith(fixtures.authOtpRequested),
      'POST',
      '/me/phone/request',
      { phone: '+37491770059' },
    ],
    [
      'useVerifyPhoneChange',
      useVerifyPhoneChange as never,
      { phone: '+37491770059', code: '123456' },
      replyWith(fixtures.meRider),
      'POST',
      '/me/phone/verify',
      { phone: '+37491770059', code: '123456' },
    ],
    [
      'useRegisterDevice',
      useRegisterDevice as never,
      { push_token: 'ExponentPushToken[fixtureRiderToken01]', platform: 'android' },
      replyWith(fixtures.devicesRegistered),
      'POST',
      '/devices',
      { push_token: 'ExponentPushToken[fixtureRiderToken01]', platform: 'android' },
    ],
    ['useUnregisterDevice', useUnregisterDevice as never, 4, empty() as never, 'DELETE', '/devices/4', undefined],
    [
      'useCreateSavedPlace',
      useCreateSavedPlace as never,
      { label: 'home', name: 'Home', address: 'Abovyan St 1', ...point },
      replyWith(fixtures.savedPlacesCreated),
      'POST',
      '/saved-places',
      { label: 'home', name: 'Home', address: 'Abovyan St 1', ...point },
    ],
    [
      'useUpdateSavedPlace',
      useUpdateSavedPlace as never,
      { id: 1, body: { name: 'Flat' } },
      replyWith(fixtures.savedPlacesShow),
      'PATCH',
      '/saved-places/1',
      { name: 'Flat' },
    ],
    ['useDeleteSavedPlace', useDeleteSavedPlace as never, 1, empty() as never, 'DELETE', '/saved-places/1', undefined],
    [
      'useFareEstimate',
      useFareEstimate as never,
      { pickup: point, dropoff: { lat: 40.2, lng: 44.53 } },
      replyWith(fixtures.fareEstimate),
      'POST',
      '/trips/fare-estimate',
      { pickup: point, dropoff: { lat: 40.2, lng: 44.53 } },
    ],
    [
      'useCreateSupportTicket',
      useCreateSupportTicket as never,
      { category: 'fare', subject: 'Question about my fare', message: 'Why?' },
      replyWith(fixtures.supportTicketCreated),
      'POST',
      '/support-tickets',
      { category: 'fare', subject: 'Question about my fare', message: 'Why?' },
    ],
    [
      'useAddSupportMessage',
      useAddSupportMessage as never,
      { ticketId: 1, body: { body: 'Any update?' } },
      replyWith(fixtures.supportMessageCreated),
      'POST',
      '/support-tickets/1/messages',
      { body: 'Any update?' },
    ],
    [
      'useApplyAsDriver',
      useApplyAsDriver as never,
      undefined,
      replyWith(fixtures.driverApplication),
      'POST',
      '/driver/application',
      undefined,
    ],
    [
      'useSaveDriverProfile',
      useSaveDriverProfile as never,
      { license_number: 'FIX-12345', license_expiry: '2027-11-20' },
      replyWith(fixtures.driverProfile),
      'PUT',
      '/driver/profile',
      { license_number: 'FIX-12345', license_expiry: '2027-11-20' },
    ],
    [
      'useCreateVehicle',
      useCreateVehicle as never,
      vehicle,
      replyWith(fixtures.driverVehicleCreated),
      'POST',
      '/driver/vehicles',
      vehicle,
    ],
    [
      'useUpdateVehicle',
      useUpdateVehicle as never,
      { id: 1, body: { color: 'Black' } },
      replyWith(fixtures.driverVehicleCreated),
      'PATCH',
      '/driver/vehicles/1',
      { color: 'Black' },
    ],
    ['useDeleteVehicle', useDeleteVehicle as never, 1, empty() as never, 'DELETE', '/driver/vehicles/1', undefined],
    [
      'useCreateBankAccount',
      useCreateBankAccount as never,
      { account_holder: 'Fixture Driver', bank_name: 'Fixture Bank', account_number: 'AM00FIXTURE000123' },
      replyWith(fixtures.driverBankAccountCreated),
      'POST',
      '/driver/bank-accounts',
      { account_holder: 'Fixture Driver', bank_name: 'Fixture Bank', account_number: 'AM00FIXTURE000123' },
    ],
    [
      'useDeleteBankAccount',
      useDeleteBankAccount as never,
      1,
      empty() as never,
      'DELETE',
      '/driver/bank-accounts/1',
      undefined,
    ],
    [
      'useUploadDriverDocument',
      useUploadDriverDocument as never,
      upload,
      replyWith(fixtures.driverDocumentCreated),
      'POST',
      '/driver/documents',
      'form',
    ],
    [
      'useSetAvailability',
      useSetAvailability as never,
      { availability: 'online' },
      ok({ availability: 'online' }) as never,
      'POST',
      '/driver/availability',
      { availability: 'online' },
    ],
    [
      'useSendDriverLocation',
      useSendDriverLocation as never,
      { ...point, heading: 90 },
      ok({ recorded_at: '2026-10-16T07:31:28.123Z' }) as never,
      'POST',
      '/driver/location',
      { ...point, heading: 90 },
    ],
    ['useLogout', useLogout as never, undefined, empty() as never, 'POST', '/auth/logout', undefined],
    ['useLogoutAll', useLogoutAll as never, undefined, empty() as never, 'POST', '/auth/logout-all', undefined],
  ];

  it.each(rows)('%s', async (_name, hook, vars, reply, method, path, body) => {
    // Refetches of the lists a write makes stale are answered with an empty list: this test is about the write itself.
    const { result, server } = await renderWithApi(hook, [reply, ...Array.from({ length: 4 }, () => ok({ data: [] }))]);
    await act(async () => {
      await result.current.mutateAsync(vars as never);
    });

    expect(server.requests[0]).toMatchObject({ method, path });
    if (body === 'form') {
      expect(server.requests[0]?.body).toBeInstanceOf(FormData);
    } else {
      expect(server.requests[0]?.body).toEqual(body);
    }
  });

  it('reports a refusal as the tagged error with the field messages', async () => {
    const { result } = await renderWithApi(() => useRequestOtp(), [replyWith(fixtures.errorInvalidCode)]);
    await act(async () => {
      await result.current.mutateAsync({ phone: '+37491770058', app: 'rider' }).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fieldError(result.current.error, 'code')).toBe('The code is invalid or has expired.');
  });
});

describe('resolving a chosen place', () => {
  it('fetches the place with the search session and gives it back', async () => {
    const { result, server } = await renderWithApi(() => useResolvePlace(), [replyWith(fixtures.geoPlace)]);

    let place: unknown;
    await act(async () => {
      place = await result.current.mutateAsync({ placeId: 'osm:N1/2', session: 'search-1' });
    });

    expect(server.requests[0]).toMatchObject({
      method: 'GET',
      path: '/geo/places/osm%3AN1%2F2',
      query: { session: 'search-1' },
    });
    expect(place).toEqual(fixtures.geoPlace.body.place);
  });

  it('works without a session, and reports a missing place as the tagged error', async () => {
    const { result, server } = await renderWithApi(() => useResolvePlace(), [replyWith(fixtures.errorNotFound)]);

    await act(async () => {
      await result.current.mutateAsync({ placeId: 'gone' }).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(server.requests[0]?.query).toEqual({});
    expect(getApiError(result.current.error)?.kind).toBe('not_found');
  });
});

describe('signing in', () => {
  it('starts the session and puts the person in the cache, with no extra request', async () => {
    const { result, server, queryClient } = await renderWithApi(
      () => ({ verify: useVerifyOtp(), status: useSessionStatus() }),
      [replyWith(fixtures.authSessionRider)],
      { signedIn: null },
    );
    await waitFor(() => expect(result.current.status).toBe('signed_out'));
    await act(async () => {
      await result.current.verify.mutateAsync({
        phone: '+37491770058',
        code: '123456',
        app: 'rider',
        device_id: 'device-0001',
      });
    });

    await waitFor(() => expect(result.current.status).toBe('signed_in'));
    expect(queryClient.getQueryData(queryKeys.me)).toEqual(fixtures.authSessionRider.body.user);
    expect(server.requests).toHaveLength(1);
  });

  it('a wrong code leaves the app signed out', async () => {
    const { result } = await renderWithApi(
      () => ({ verify: useVerifyOtp(), status: useSessionStatus() }),
      [replyWith(fixtures.errorInvalidCode)],
      { signedIn: null },
    );
    await waitFor(() => expect(result.current.status).toBe('signed_out'));
    await act(async () => {
      await result.current.verify
        .mutateAsync({ phone: '+37491770058', code: '000000', app: 'rider', device_id: 'device-0001' })
        .catch(() => undefined);
    });

    await waitFor(() => expect(result.current.verify.isError).toBe(true));
    expect(result.current.status).toBe('signed_out');
    expect(getApiError(result.current.verify.error)).toMatchObject({ kind: 'validation' });
  });

  it('a social sign-in without a phone is signed in but flagged as needing one', async () => {
    const { result } = await renderWithApi(
      () => useSocialLogin(),
      [ok({ ...fixtures.authSessionRider.body, needs_phone: true })],
      { signedIn: null },
    );
    await act(async () => {
      await result.current.mutateAsync({ provider: 'apple', token: 't', app: 'rider', device_id: 'device-0001' });
    });

    await waitFor(() => expect(result.current.data?.needs_phone).toBe(true));
  });

  it('signing out empties the cache and the session', async () => {
    const { result, queryClient } = await renderWithApi(
      () => ({ me: useMe(), logout: useLogout(), status: useSessionStatus() }),
      [replyWith(fixtures.meRider), empty()],
    );
    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    await act(async () => {
      await result.current.logout.mutateAsync();
    });

    await waitFor(() => expect(result.current.status).toBe('signed_out'));
    expect(queryClient.getQueryData(queryKeys.me)).toBeUndefined();
  });

  it('"sign out everywhere" keeps the cache and session if the server could not be reached', async () => {
    const { result, queryClient } = await renderWithApi(
      () => ({ me: useMe(), logoutAll: useLogoutAll(), status: useSessionStatus() }),
      [replyWith(fixtures.meRider), 'network-error'],
    );
    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    await act(async () => {
      await result.current.logoutAll.mutateAsync().catch(() => undefined);
    });

    await waitFor(() => expect(result.current.logoutAll.isError).toBe(true));
    expect(result.current.status).toBe('signed_in');
    expect(queryClient.getQueryData(queryKeys.me)).toBeDefined();
  });
});

describe('a write updates what is on screen', () => {
  it('changing the profile replaces the cached person without asking the server again', async () => {
    const { result, server, queryClient } = await renderWithApi(() => {
      const me = useMe();

      return { isSuccess: me.isSuccess, locale: me.data?.locale, update: useUpdateMe() };
    }, [replyWith(fixtures.meRider), replyWith(fixtures.meRiderUpdated)]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      await result.current.update.mutateAsync({ name: 'Fixture Rider', locale: 'ru' });
    });

    await waitFor(() => expect(result.current.locale).toBe('ru'));
    expect(queryClient.getQueryData(queryKeys.me)).toEqual(fixtures.meRiderUpdated.body.user);
    expect(server.requests).toHaveLength(2);
  });

  it('confirming a new phone number replaces the cached person too', async () => {
    const { result, queryClient } = await renderWithApi(
      () => useVerifyPhoneChange(),
      [replyWith(fixtures.meRiderUpdated)],
    );
    await act(async () => {
      await result.current.mutateAsync({ phone: '+37491770059', code: '123456' });
    });

    expect(queryClient.getQueryData(queryKeys.me)).toEqual(fixtures.meRiderUpdated.body.user);
  });

  it.each([
    [
      'adding a saved place',
      () => useCreateSavedPlace(),
      { label: 'home', name: 'Home', address: 'A', ...point },
      replyWith(fixtures.savedPlacesCreated),
    ],
    [
      'changing one',
      () => useUpdateSavedPlace(),
      { id: 1, body: { name: 'Flat' } },
      replyWith(fixtures.savedPlacesShow),
    ],
    ['removing one', () => useDeleteSavedPlace(), 1, empty()],
  ] as const)('%s refreshes the list of saved places', async (_name, mutation, vars, reply) => {
    const { result, server } = await renderWithApi(
      () => ({
        list: useSavedPlaces(),
        mutation: (mutation as () => { mutateAsync: (v: never) => Promise<unknown> })(),
      }),
      [replyWith(fixtures.savedPlacesList), reply as never, replyWith(fixtures.savedPlacesList)],
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    await act(async () => {
      await result.current.mutation.mutateAsync(vars as never);
    });
    await waitFor(() => expect(server.requests).toHaveLength(3));

    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /saved-places',
      expect.any(String),
      'GET /saved-places',
    ]);
  });

  it('adding a vehicle refreshes both the vehicle list and the driver block of the person (onboarding checklist)', async () => {
    const { result, server } = await renderWithApi(
      () => ({ vehicles: useDriverVehicles(), me: useMe(), create: useCreateVehicle() }),
      [
        replyWith(fixtures.driverVehicles),
        replyWith(fixtures.meDriver),
        replyWith(fixtures.driverVehicleCreated),
        replyWith(fixtures.driverVehicles),
        replyWith(fixtures.meDriver),
      ],
    );
    await waitFor(() => expect(result.current.vehicles.isSuccess && result.current.me.isSuccess).toBe(true));
    await act(async () => {
      await result.current.create.mutateAsync(vehicle);
    });
    await waitFor(() => expect(server.requests).toHaveLength(5));

    expect(
      server.requests
        .slice(3)
        .map((r) => r.path)
        .sort(),
    ).toEqual(['/driver/vehicles', '/me']);
  });

  it('opening a ticket refreshes the ticket list', async () => {
    const { result, server } = await renderWithApi(
      () => ({ tickets: useSupportTickets(1), create: useCreateSupportTicket() }),
      [
        replyWith(fixtures.supportTicketList),
        replyWith(fixtures.supportTicketCreated),
        replyWith(fixtures.supportTicketList),
      ],
    );
    await waitFor(() => expect(result.current.tickets.isSuccess).toBe(true));
    await act(async () => {
      await result.current.create.mutateAsync({ category: 'fare', subject: 'Question about my fare', message: 'Why?' });
    });
    await waitFor(() => expect(server.requests).toHaveLength(3));

    expect(server.requests[2]).toMatchObject({ method: 'GET', path: '/support-tickets' });
  });

  it('going online refreshes the person, whose driver block shows the new availability', async () => {
    const { result, server } = await renderWithApi(
      () => ({ me: useMe(), availability: useSetAvailability() }),
      [replyWith(fixtures.meDriver), ok({ availability: 'online' }), replyWith(fixtures.meDriver)],
    );
    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    await act(async () => {
      await result.current.availability.mutateAsync({ availability: 'online' });
    });
    await waitFor(() => expect(server.requests).toHaveLength(3));

    expect(server.requests[2]).toMatchObject({ method: 'GET', path: '/me' });
  });
});

describe('pressing a button again is safe', () => {
  const ticket = { category: 'fare', subject: 'Question about my fare', message: 'Why?' } as const;

  it('a retry after a dropped connection sends the same Idempotency-Key and opens one ticket', async () => {
    const { result, server } = await renderWithApi(
      () => useCreateSupportTicket(),
      [
        // The request makes three attempts before the person sees an error (retries: 2 is safe: they share the key).
        'network-error',
        'network-error',
        'network-error',
        replyWith(fixtures.supportTicketCreated),
      ],
    );
    await act(async () => {
      await result.current.mutateAsync(ticket).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    await act(async () => {
      await result.current.mutateAsync(ticket);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Three failed attempts of the first press, then the second press: every request carried the same key.
    expect(server.requests).toHaveLength(4);
    expect(new Set(server.requests.map((r) => r.headers['idempotency-key'])).size).toBe(1);
  });

  it('editing the message after a failed attempt is a new action with a new key (a key must never be reused for a different message)', async () => {
    // The first attempt gets no answer, so the server may or may not have it: the key is kept for an identical retry, but not for an edit.
    const { result, server } = await renderWithApi(
      () => useCreateSupportTicket(),
      [
        'network-error',
        'network-error',
        'network-error',
        replyWith(fixtures.supportTicketCreated),
        replyWith(fixtures.supportTicketList),
      ],
    );
    await act(async () => {
      await result.current.mutateAsync({ ...ticket, message: 'First wording' }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    await act(async () => {
      await result.current.mutateAsync({ ...ticket, message: 'Corrected wording' });
    });

    const keys = server.requests.map((r) => r.headers['idempotency-key']);
    expect(new Set(keys.slice(0, 3)).size).toBe(1);
    expect(keys[3]).not.toBe(keys[0]);
    expect(server.requests[3]?.body).toMatchObject({ message: 'Corrected wording' });
  });

  it('a validation refusal then a corrected message also starts a new action', async () => {
    const { result, server } = await renderWithApi(
      () => useCreateSupportTicket(),
      [
        replyWith(fixtures.errorValidation),
        replyWith(fixtures.supportTicketCreated),
        replyWith(fixtures.supportTicketList),
      ],
    );
    await act(async () => {
      await result.current.mutateAsync({ ...ticket, message: '' }).catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync(ticket);
    });

    expect(server.requests[1]?.headers['idempotency-key']).not.toBe(server.requests[0]?.headers['idempotency-key']);
  });

  it('after a success the next identical request is a new action', async () => {
    const { result, server } = await renderWithApi(
      () => useCreateSupportTicket(),
      [replyWith(fixtures.supportTicketCreated), replyWith(fixtures.supportTicketCreated)],
    );
    await act(async () => {
      await result.current.mutateAsync(ticket);
    });
    await act(async () => {
      await result.current.mutateAsync(ticket);
    });

    expect(server.requests).toHaveLength(2);
    expect(server.requests[1]?.headers['idempotency-key']).not.toBe(server.requests[0]?.headers['idempotency-key']);
  });

  it('a double tap sends one request', async () => {
    const { result, server } = await renderWithApi(
      () => useCreateSupportTicket(),
      [replyWith(fixtures.supportTicketCreated)],
    );
    await act(async () => {
      await Promise.all([result.current.mutateAsync(ticket), result.current.mutateAsync(ticket)]);
    });

    expect(server.requests).toHaveLength(1);
  });

  it('a document that failed to upload is retried with the same key, and stored once', async () => {
    const { result, server } = await renderWithApi(
      () => useUploadDriverDocument(),
      [
        'network-error',
        replyWith(fixtures.driverDocumentCreated),
        ok({ data: [], required: [], all_submitted: false }),
        replyWith(fixtures.meDriver),
      ],
    );
    await act(async () => {
      await result.current.mutateAsync(upload).catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync(upload);
    });

    expect(server.requests[1]?.headers['idempotency-key']).toBe(server.requests[0]?.headers['idempotency-key']);
  });

  it('adding a message to one ticket and to another are separate actions', async () => {
    const { result, server } = await renderWithApi(
      () => useAddSupportMessage(),
      [replyWith(fixtures.supportMessageCreated), replyWith(fixtures.supportMessageCreated)],
    );
    await act(async () => {
      await result.current.mutateAsync({ ticketId: 1, body: { body: 'Hello' } });
      await result.current.mutateAsync({ ticketId: 2, body: { body: 'Hello' } });
    });

    expect(server.requests[1]?.headers['idempotency-key']).not.toBe(server.requests[0]?.headers['idempotency-key']);
  });

  it('keeps the idempotency key on the error, so a screen that wants to keep its own can', async () => {
    const { result, server } = await renderWithApi(() => useCreateVehicle(), ['network-error']);
    await act(async () => {
      await result.current.mutateAsync(vehicle).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as ApiRequestError).idempotencyKey).toBe(
      server.requests[0]?.headers['idempotency-key'],
    );
    expect(server.requests[0]?.headers['idempotency-key']).toBeDefined();
  });
});
