# API client, error model and fixtures

Every call to the Laravel backend goes through `@taxikosmos/api-client`. Screens never call `fetch`, parse a status code or read a token.

```
packages/core        types of every /api/v1 answer, the error model, phone / money / idempotency helpers, recorded real responses
packages/api-client  the HTTP client, the session, the endpoints, the realtime connection, the React Query hooks
```

## In a screen

```tsx
const me = useMe(); // GET /me, only once a person is signed in
const update = useUpdateMe(); // PATCH /me, puts the answer in the cache
update.mutate({ name: 'Anna' });
fieldError(update.error, 'name'); // the server's message for that field, or null
```

The root layout wraps the app in `<ApiProvider client={appApi.client} realtime={appApi.realtime}>` (`apps/*/src/api.ts` builds `appApi` with
`createAppApi`). The provider reads the saved session at start-up, empties the cache on sign-out, and refetches what is on screen when the
app returns to the foreground and when the realtime connection comes back.

Hooks exist for every endpoint the backend has today (see `packages/api-client/src/react/queries.ts` and `mutations.ts`). Add a new
endpoint to `src/resources/`, then its hook, and its recorded answer to the fixtures (below).

## Errors

A failed call throws `ApiRequestError`; its `.error` is one tagged union (`packages/core/src/api/errors.ts`):

| `kind`                       | Status | What the screen does                                           |
| ---------------------------- | ------ | -------------------------------------------------------------- |
| `validation`                 | 422    | show `fieldErrors` next to the fields; nothing was saved       |
| `unauthenticated`            | 401    | go to sign-in (the session already ended)                      |
| `forbidden`                  | 403    | switch on `code` (`account_suspended`, `driver_not_verified`…) |
| `not_found`                  | 404    | your own "not found" copy                                      |
| `conflict`                   | 409    | `body` can carry the current resource: resync from it          |
| `gone`                       | 410    | e.g. `quote_expired`: ask for a new quote                      |
| `rate_limited`               | 429    | wait `retryAfterSeconds`                                       |
| `server`                     | 5xx    | "try again"; the cache already retried twice                   |
| `network`, `timeout`         | none   | offline: show the offline state, keep the form                 |
| `client`, `invalid_response` | other  | a bug or an unexpected answer: report it                       |

`message` is the server's sentence in the user's language, set only where the server wrote it for people. It is `null` for 404 and plain
5xx, because Laravel puts internals in them: show your own translated text there.

## Tokens and renewal

- The session (access and refresh token) is kept only in `expo-secure-store` (`createAppApi`, available after the first unlock so a locked phone
  can still report location).
- A request refused with 401 renews the session once and is sent again. Requests refused at the same time share **one** renewal. A token that
  is about to expire is renewed before sending.
- **A refresh token works once.** The server treats a second use as theft and ends the whole session, so the client never sends one twice, and saves
  the new pair before anything uses it. If the connection drops during a renewal the session is kept and the next call tries again.

## Writes and idempotency keys

Every POST, PUT, PATCH and DELETE carries an `Idempotency-Key` (UUID v7). To make a user action safe to repeat, name it:

```ts
api.support.create(body, 'ticket:draft-1'); // same name => same key until the server accepts it
```

A retry after a dropped connection (or after closing the app) reuses the key; once accepted, repeating the action returns the stored answer
with no second request; a double tap shares one request; a final refusal (e.g. 422) ends the action so the corrected attempt gets a new key.

- **The mutation hooks** name an action for you and keep the name while the screen is mounted: pressing the button again, or a double tap,
  reuses the key, and editing the input starts a new action. A screen that is closed and reopened starts a new action; where a retry must
  survive that, pass your own stable name to the endpoint function (`api.support.create(body, 'ticket:draft-1')`).
- **What is kept, and for how long.** The record of an action (its key and the server's answer, which can hold names, addresses or bank
  details) lives in the secure store, never in plain storage. It is deleted when the person signs out, when another person signs in, and
  when the app starts and finds nobody signed in. Records older than 24 hours are also deleted the next time any action is stored. An action
  that finishes after sign-out does not write itself back.
- **Storage is best effort.** If the secure store cannot be read or written (a locked or damaged keychain), the request is still sent and its real
  result returned: only the restart-safety of that one action is lost. During a run the client's own memory of the last 50 actions is the
  truth: it is asked first, so a record the store failed to save or to delete cannot make an accepted action go out twice, or give a corrected
  input the key of a refused one. The store is asked only about actions this run knows nothing about (after a restart).
- **The backend honours the header only on support tickets today**; the other writes rely on the app not repeating them. Endpoints marked
  `retries` resend by themselves only where the server dedupes.

## Realtime

`RealtimeClient` keeps one Socket.io connection per signed-in session (reconnecting with growing pauses and a fresh token each time) and asks the screens to
refetch over REST after every reconnect and every return to the foreground: **REST is the truth, events are hints**. Events are de-duplicated
by `event_id`. With no `REALTIME_URL` it never connects, and `usePollingInterval(ms)` tells a query to poll instead. The service does not exist
yet: the handshake sends `{ token, app }` in `auth`, to be confirmed when it is built.

## Fixtures: real answers, checked by the compiler

`packages/core/fixtures/*.json` are recorded from the running backend; `packages/core/src/fixtures/index.ts` is generated from them and
declares each one `satisfies` the matching type. If the backend changes an answer, re-record and let the type-check show what to update:

```bash
node scripts/capture-fixtures.mjs     # resets the e2e database, starts the backend on :8001, records, regenerates
pnpm typecheck
node scripts/capture-fixtures.mjs --emit   # regenerate the TypeScript from the JSON only (no server)
```

Needs the Laravel repo next to this one (`../taxiKosmos-laravel`, or `BACKEND_DIR`) with its `.env.e2e`; it never touches the dev database.
The api-client tests answer from these recordings, so they exercise the shapes the server really sends.
