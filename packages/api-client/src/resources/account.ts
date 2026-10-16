import type {
  Data,
  Device,
  DeviceResponse,
  Me,
  MeResponse,
  OtpRequested,
  PhoneChangeBody,
  PhoneVerifyBody,
  RegisterDeviceBody,
  SavedPlace,
  SavedPlaceBody,
  SavedPlaceUpdate,
  UpdateMeBody,
} from '@taxikosmos/core';

import type { ApiClient } from '../client';

export function meApi(client: ApiClient) {
  return {
    async get(signal?: AbortSignal): Promise<Me> {
      return (await client.get<MeResponse>('/me', { signal })).data.user;
    },

    async update(body: UpdateMeBody, operation?: string): Promise<Me> {
      return (await client.patch<MeResponse>('/me', { body, operation })).data.user;
    },

    /** Sends a code to the new number. */
    async requestPhoneChange(body: PhoneChangeBody): Promise<OtpRequested> {
      return (await client.post<OtpRequested>('/me/phone/request', { body })).data;
    },

    /** Confirms the code and changes the number. */
    async verifyPhoneChange(body: PhoneVerifyBody): Promise<Me> {
      return (await client.post<MeResponse>('/me/phone/verify', { body })).data.user;
    },
  };
}

export function savedPlacesApi(client: ApiClient) {
  return {
    async list(signal?: AbortSignal): Promise<SavedPlace[]> {
      return (await client.get<Data<SavedPlace[]>>('/saved-places', { signal })).data.data;
    },

    async get(id: number, signal?: AbortSignal): Promise<SavedPlace> {
      return (await client.get<Data<SavedPlace>>(`/saved-places/${id}`, { signal })).data.data;
    },

    async create(body: SavedPlaceBody, operation?: string): Promise<SavedPlace> {
      return (await client.post<Data<SavedPlace>>('/saved-places', { body, operation })).data.data;
    },

    async update(id: number, body: SavedPlaceUpdate): Promise<SavedPlace> {
      return (await client.patch<Data<SavedPlace>>(`/saved-places/${id}`, { body })).data.data;
    },

    async remove(id: number): Promise<void> {
      await client.delete<null>(`/saved-places/${id}`);
    },
  };
}

export function devicesApi(client: ApiClient) {
  return {
    /** Registers (or refreshes) this install's push token. Safe to repeat: the server keeps one row per token. */
    async register(body: RegisterDeviceBody): Promise<Device> {
      return (await client.post<DeviceResponse>('/devices', { body })).data.device;
    },

    async unregister(id: number): Promise<void> {
      await client.delete<null>(`/devices/${id}`);
    },
  };
}
