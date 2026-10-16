import type {
  Data,
  DriverApplication,
  DriverAvailabilityBody,
  DriverAvailabilityResponse,
  DriverBankAccount,
  DriverBankAccountBody,
  DriverDocument,
  DriverDocumentsResponse,
  DriverDocumentUpload,
  DriverLocationBody,
  DriverLocationRecorded,
  DriverProfileBody,
  DriverVehicle,
  DriverVehicleBody,
  DriverVehicleUpdate,
} from '@taxikosmos/core';

import type { ApiClient } from '../client';

/** Builds the multipart body of a document upload. A React Native file part is `{ uri, name, type }`. */
export function documentForm(upload: DriverDocumentUpload): FormData {
  const form = new FormData();
  form.append('type', upload.type);
  // React Native's FormData takes a file as an object with a uri; its TypeScript type only knows Blob.
  form.append('file', upload.file as unknown as Blob);

  if (upload.vehicle_id != null) {
    form.append('vehicle_id', String(upload.vehicle_id));
  }

  if (upload.expires_at) {
    form.append('expires_at', upload.expires_at);
  }

  if (upload.document_number) {
    form.append('document_number', upload.document_number);
  }

  return form;
}

export function driverApi(client: ApiClient) {
  return {
    /** Applies to become a driver. Safe to repeat: an existing application is returned. */
    async apply(): Promise<DriverApplication> {
      return (await client.post<Data<DriverApplication>>('/driver/application')).data.data;
    },

    async saveProfile(body: DriverProfileBody): Promise<DriverApplication> {
      return (await client.put<Data<DriverApplication>>('/driver/profile', { body })).data.data;
    },

    vehicles: {
      async list(signal?: AbortSignal): Promise<DriverVehicle[]> {
        return (await client.get<Data<DriverVehicle[]>>('/driver/vehicles', { signal })).data.data;
      },
      async create(body: DriverVehicleBody, operation?: string): Promise<DriverVehicle> {
        return (await client.post<Data<DriverVehicle>>('/driver/vehicles', { body, operation })).data.data;
      },
      async update(id: number, body: DriverVehicleUpdate): Promise<DriverVehicle> {
        return (await client.patch<Data<DriverVehicle>>(`/driver/vehicles/${id}`, { body })).data.data;
      },
      async remove(id: number): Promise<void> {
        await client.delete<null>(`/driver/vehicles/${id}`);
      },
    },

    bankAccounts: {
      async list(signal?: AbortSignal): Promise<DriverBankAccount[]> {
        return (await client.get<Data<DriverBankAccount[]>>('/driver/bank-accounts', { signal })).data.data;
      },
      async create(body: DriverBankAccountBody, operation?: string): Promise<DriverBankAccount> {
        return (await client.post<Data<DriverBankAccount>>('/driver/bank-accounts', { body, operation })).data.data;
      },
      async remove(id: number): Promise<void> {
        await client.delete<null>(`/driver/bank-accounts/${id}`);
      },
    },

    documents: {
      async list(signal?: AbortSignal): Promise<DriverDocumentsResponse> {
        return (await client.get<DriverDocumentsResponse>('/driver/documents', { signal })).data;
      },
      /** Uploads one document file. The longer time limit is for a photo on a slow connection. */
      async upload(upload: DriverDocumentUpload, operation?: string): Promise<DriverDocument> {
        return (
          await client.post<Data<DriverDocument>>('/driver/documents', {
            body: documentForm(upload),
            operation,
            timeoutMs: 60_000,
          })
        ).data.data;
      },
    },

    /** Goes online or offline. */
    async setAvailability(body: DriverAvailabilityBody): Promise<DriverAvailabilityResponse> {
      return (await client.post<DriverAvailabilityResponse>('/driver/availability', { body })).data;
    },

    /** Reports where the driver is. Meant to be called every few seconds while online, so it is cheap and never retried. */
    async sendLocation(body: DriverLocationBody, signal?: AbortSignal): Promise<DriverLocationRecorded> {
      return (await client.post<DriverLocationRecorded>('/driver/location', { body, signal, timeoutMs: 8_000 })).data;
    },
  };
}
