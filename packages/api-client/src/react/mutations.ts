import type {
  AuthSession,
  DriverAvailabilityBody,
  DriverBankAccountBody,
  DriverDocumentUpload,
  DriverLocationBody,
  DriverProfileBody,
  DriverVehicleBody,
  DriverVehicleUpdate,
  FareEstimateBody,
  Me,
  OtpRequested,
  OtpRequestBody,
  OtpVerifyBody,
  PhoneChangeBody,
  PhoneVerifyBody,
  RegisterDeviceBody,
  SavedPlaceBody,
  SavedPlaceUpdate,
  SocialLoginBody,
  SocialProvider,
  SupportMessageBody,
  SupportTicketBody,
  Trip,
  TripRequestBody,
  UpdateMeBody,
} from '@taxikosmos/core';
import { newIdempotencyKey, tripOfConflict } from '@taxikosmos/core';
import { useMutation, useQueryClient, type QueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useRef } from 'react';

import { useApi } from './context';
import { queryKeys } from './keys';
import { putTrip } from './tripCache';

type Mutation<TData, TVars> = UseMutationResult<TData, Error, TVars>;

/** The signed-in person changed: put the fresh copy where every screen reads it. */
function setMe(queryClient: QueryClient, me: Me): void {
  queryClient.setQueryData(queryKeys.me, me);
}

/** After a sign-in answer: the session was started by the API call; the person is known without another request. */
function seedSession(queryClient: QueryClient, session: AuthSession): void {
  setMe(queryClient, session.user);
}

/**
 * A write the user starts on purpose. It remembers one operation name per intent: pressing the button again after a failure (or a double tap)
 * sends the same `Idempotency-Key`, so the server applies it once; changing the input, or a success, starts a new intent.
 */
function useIntent(name: string) {
  const current = useRef<{ operation: string; input: string } | null>(null);

  return {
    operationFor(input: unknown): string {
      const serialised = JSON.stringify(input) ?? '';

      if (current.current === null || current.current.input !== serialised) {
        current.current = { operation: `${name}:${newIdempotencyKey()}`, input: serialised };
      }

      return current.current.operation;
    },
    done() {
      current.current = null;
    },
  };
}

// ---- sign-in and out ----

export function useRequestOtp(): Mutation<OtpRequested, OtpRequestBody> {
  const api = useApi();

  return useMutation({ mutationFn: (body: OtpRequestBody) => api.auth.requestOtp(body) });
}

export function useVerifyOtp(): Mutation<AuthSession, OtpVerifyBody> {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: OtpVerifyBody) => api.auth.verifyOtp(body),
    onSuccess: (session) => seedSession(queryClient, session),
  });
}

export function useSocialLogin(): Mutation<AuthSession, SocialLoginBody & { provider: SocialProvider }> {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, ...body }: SocialLoginBody & { provider: SocialProvider }) =>
      api.auth.loginWithSocial(provider, body),
    onSuccess: (session) => seedSession(queryClient, session),
  });
}

export function useVerifyPhone(): Mutation<AuthSession, PhoneVerifyBody> {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: PhoneVerifyBody) => api.auth.verifyPhone(body),
    onSuccess: (session) => seedSession(queryClient, session),
  });
}

export function useLogout(): Mutation<void, void> {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({ mutationFn: () => api.auth.logout(), onSettled: () => queryClient.clear() });
}

export function useLogoutAll(): Mutation<void, void> {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({ mutationFn: () => api.auth.logoutAll(), onSuccess: () => queryClient.clear() });
}

// ---- the signed-in person ----

export function useUpdateMe(): Mutation<Me, UpdateMeBody> {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateMeBody) => api.me.update(body),
    onSuccess: (me) => setMe(queryClient, me),
  });
}

export function useRequestPhoneChange(): Mutation<OtpRequested, PhoneChangeBody> {
  const api = useApi();

  return useMutation({ mutationFn: (body: PhoneChangeBody) => api.me.requestPhoneChange(body) });
}

export function useVerifyPhoneChange(): Mutation<Me, PhoneVerifyBody> {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: PhoneVerifyBody) => api.me.verifyPhoneChange(body),
    onSuccess: (me) => setMe(queryClient, me),
  });
}

export function useRegisterDevice() {
  const api = useApi();

  return useMutation({ mutationFn: (body: RegisterDeviceBody) => api.devices.register(body) });
}

export function useUnregisterDevice() {
  const api = useApi();

  return useMutation({ mutationFn: (id: number) => api.devices.unregister(id) });
}

// ---- saved places ----

export function useCreateSavedPlace() {
  const api = useApi();
  const queryClient = useQueryClient();
  const intent = useIntent('saved-place');

  return useMutation({
    mutationFn: (body: SavedPlaceBody) => api.savedPlaces.create(body, intent.operationFor(body)),
    onSuccess: () => {
      intent.done();

      return queryClient.invalidateQueries({ queryKey: queryKeys.savedPlaces.all });
    },
  });
}

export function useUpdateSavedPlace() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: SavedPlaceUpdate }) => api.savedPlaces.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.savedPlaces.all }),
  });
}

export function useDeleteSavedPlace() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.savedPlaces.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.savedPlaces.all }),
  });
}

// ---- geo ----

/**
 * The coordinates and address of the suggestion the person tapped. A read, asked for when they choose, so it is a mutation (no cache, no
 * refetch). Pass the search's `session` so the provider bills the typing and the choice as one search.
 */
export function useResolvePlace() {
  const api = useApi();

  return useMutation({
    mutationFn: ({ placeId, session }: { placeId: string; session?: string | undefined }) =>
      api.geo.place(placeId, session),
  });
}

// ---- fares ----

export function useFareEstimate() {
  const api = useApi();

  return useMutation({ mutationFn: (body: FareEstimateBody) => api.fares.estimate(body) });
}

// ---- trips ----

/**
 * Books a ride. Pressing "Request" again after a failure (or double-tapping it) sends the same `Idempotency-Key`, so the server creates one
 * trip; a different quote, class or place starts a new request. A 409 that carries the rider's existing trip puts that trip in the cache.
 */
export function useRequestTrip() {
  const api = useApi();
  const queryClient = useQueryClient();
  const intent = useIntent('trip-request');

  return useMutation({
    mutationFn: (body: TripRequestBody) => api.trips.request(body, intent.operationFor(body)),
    onSuccess: (trip) => {
      intent.done();
      putTrip(queryClient, trip);
    },
    onError: (error) => {
      const existing = tripOfConflict(error);

      if (existing !== null) {
        putTrip(queryClient, existing);
      }
    },
  });
}

/** Cancels a trip; a 409 (it moved on meanwhile) shows the trip as it is now. */
export function useCancelTrip() {
  const api = useApi();
  const queryClient = useQueryClient();
  const intent = useIntent('trip-cancel');

  return useMutation({
    mutationFn: (id: number) => api.trips.cancel(id, intent.operationFor(id)),
    onSuccess: (trip) => {
      intent.done();
      putTrip(queryClient, trip);
    },
    onError: (error) => {
      const current = tripOfConflict(error);

      if (current !== null) {
        putTrip(queryClient, current);
      }
    },
  });
}

// ---- support ----

export function useCreateSupportTicket() {
  const api = useApi();
  const queryClient = useQueryClient();
  const intent = useIntent('support-ticket');

  return useMutation({
    mutationFn: (body: SupportTicketBody) => api.support.create(body, intent.operationFor(body)),
    onSuccess: () => {
      intent.done();

      return queryClient.invalidateQueries({ queryKey: queryKeys.support.all });
    },
  });
}

export function useAddSupportMessage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const intent = useIntent('support-message');

  return useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: number; body: SupportMessageBody }) =>
      api.support.addMessage(ticketId, body, intent.operationFor({ ticketId, body })),
    onSuccess: () => {
      intent.done();

      return queryClient.invalidateQueries({ queryKey: queryKeys.support.all });
    },
  });
}

// ---- driver ----

const refreshMe = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: queryKeys.me });

export function useApplyAsDriver() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({ mutationFn: () => api.driver.apply(), onSuccess: () => refreshMe(queryClient) });
}

export function useSaveDriverProfile() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: DriverProfileBody) => api.driver.saveProfile(body),
    onSuccess: () => refreshMe(queryClient),
  });
}

export function useCreateVehicle() {
  const api = useApi();
  const queryClient = useQueryClient();
  const intent = useIntent('vehicle');

  return useMutation({
    mutationFn: (body: DriverVehicleBody) => api.driver.vehicles.create(body, intent.operationFor(body)),
    onSuccess: () => {
      intent.done();

      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.driver.vehicles }),
        refreshMe(queryClient),
      ]);
    },
  });
}

export function useUpdateVehicle() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: DriverVehicleUpdate }) => api.driver.vehicles.update(id, body),
    onSuccess: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.driver.vehicles }), refreshMe(queryClient)]),
  });
}

export function useDeleteVehicle() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.driver.vehicles.remove(id),
    onSuccess: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.driver.vehicles }), refreshMe(queryClient)]),
  });
}

export function useCreateBankAccount() {
  const api = useApi();
  const queryClient = useQueryClient();
  const intent = useIntent('bank-account');

  return useMutation({
    mutationFn: (body: DriverBankAccountBody) => api.driver.bankAccounts.create(body, intent.operationFor(body)),
    onSuccess: () => {
      intent.done();

      return queryClient.invalidateQueries({ queryKey: queryKeys.driver.bankAccounts });
    },
  });
}

export function useDeleteBankAccount() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.driver.bankAccounts.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.driver.bankAccounts }),
  });
}

/** Uploads one document. Trying the same file again after a failure sends the same key, so the document is stored once. */
export function useUploadDriverDocument() {
  const api = useApi();
  const queryClient = useQueryClient();
  const intent = useIntent('driver-document');

  return useMutation({
    mutationFn: (upload: DriverDocumentUpload) => api.driver.documents.upload(upload, intent.operationFor(upload)),
    onSuccess: () => {
      intent.done();

      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.driver.documents }),
        refreshMe(queryClient),
      ]);
    },
  });
}

export function useSetAvailability() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: DriverAvailabilityBody) => api.driver.setAvailability(body),
    onSuccess: () => refreshMe(queryClient),
  });
}

export function useSendDriverLocation() {
  const api = useApi();

  return useMutation({ mutationFn: (body: DriverLocationBody) => api.driver.sendLocation(body) });
}
