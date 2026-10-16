import type {
  Data,
  Paginated,
  SupportMessageBody,
  SupportMessageReceipt,
  SupportTicket,
  SupportTicketBody,
} from '@taxikosmos/core';

import type { ApiClient } from '../client';

export function supportApi(client: ApiClient) {
  return {
    async list(page = 1, signal?: AbortSignal): Promise<Paginated<SupportTicket>> {
      return (await client.get<Paginated<SupportTicket>>('/support-tickets', { query: { page }, signal })).data;
    },

    /** One ticket with its messages (internal notes are never sent to the app). */
    async get(id: number, signal?: AbortSignal): Promise<SupportTicket> {
      return (await client.get<Data<SupportTicket>>(`/support-tickets/${id}`, { signal })).data.data;
    },

    /** Opens a ticket. The server honours the idempotency key, so a retry cannot open a second one. */
    async create(body: SupportTicketBody, operation?: string): Promise<SupportTicket> {
      return (await client.post<Data<SupportTicket>>('/support-tickets', { body, operation, retries: 2 })).data.data;
    },

    async addMessage(ticketId: number, body: SupportMessageBody, operation?: string): Promise<SupportMessageReceipt> {
      return (
        await client.post<Data<SupportMessageReceipt>>(`/support-tickets/${ticketId}/messages`, {
          body,
          operation,
          retries: 2,
        })
      ).data.data;
    },
  };
}
