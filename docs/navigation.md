# Navigation, gating and error handling (M1-T4)

Both apps share one shell, `packages/app-shell`, so the rider and the driver app behave the same way and nothing is copied.

## The route tree

```
src/app/
  _layout.tsx        root: ApiProvider > UiProvider > <AppShell> > Stack; starts Sentry (scrubbed) and holds the splash screen
  (app)/             the signed-in app. _layout.tsx sends anyone signed out to /sign-in?next=<where they were going>
    index.tsx        placeholder home (the real screens arrive with M2+)
  (auth)/            the signed-out screens. _layout.tsx sends anyone signed in on to `next` (or the start)
    sign-in.tsx      placeholder until M2-T1 puts the phone form here
  design-preview.tsx development/staging tool, outside both groups
  +not-found.tsx     a link that leads nowhere: a plain page with a way back
```

The layouts and screens are one-line re-exports of `@taxikosmos/app-shell`; an app only adds its own screens.

## The gate (`AppShell`)

Before the screens, `AppShell` decides what the person may see. The decision is `resolveGate` in `@taxikosmos/core` (pure, tested), fed by
`useAppGate` (`@taxikosmos/app-shell`):

| Fact                                       | Source                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| The saved session                          | `useSessionStatus()` (secure store)                                           |
| May this build run                         | `GET /api/v1/app-config?app&platform&version` (public, `update.force_update`) |
| Who is signed in, and may they use the app | `GET /api/v1/me` (`status`)                                                   |

Order of precedence: **update required** (even before the saved session is read) > loading > signed out > account loading > **blocked**
(`suspended`, `deactivated`, `pending_deletion`) > **account unavailable** (could not load: retry or sign out) > ready.

- **An outdated build** sees the update screen with the store button (only an `https` link is opened) and nothing else is reachable. If the
  start-up config cannot be fetched, the app **carries on** (fail open): a server outage must not lock people out.
- **A blocked account** sees the status screen with the support contacts from the app config (mail and phone links are built only from a
  valid address or number) and a sign-out button. The screens behind are never mounted on a cold start.
- Once the screens have been shown, they stay mounted under whatever the gate shows later (a suspension noticed when the app returns to
  the foreground, an update that became mandatory), untouchable and hidden from screen readers, so the router keeps its place and the person
  is back where they were when the account is fine again. The foreground refetch comes from `ApiProvider`.
- Driver-specific gates (no application, verification pending or rejected) are part of M5-T1, not here.

## Deep links and sign-in

A link such as `taxirider://trips/42` opens its screen from a cold start. If nobody is signed in, `(app)/_layout` redirects to
`/sign-in?next=%2Ftrips%2F42`; once signed in, `(auth)/_layout` follows `next`. `next` comes from a link anyone can craft, so
`safeNextPath` (core) accepts only a path inside the app: no other scheme, no `//host`, no backslashes or control characters, no
sign-in screens, at most 300 characters. Universal (https) links are not part of the MVP.

## Errors

`AppShell` wraps everything in `AppErrorBoundary` (`@taxikosmos/ui`): an error thrown while any screen renders is caught, passed to the
app's reporter (`Sentry.captureException` with the component stack) and replaced by a "Something went wrong" screen whose **Try again**
button renders the screens again without restarting the app. A reporter that fails is ignored.

Sentry gets `beforeSend: scrubEvent` (core, from `monitoringOptions`): no user, request data, extra data or device name; phone numbers, bearer
tokens and coordinates are blanked out of messages, exception text and breadcrumbs; breadcrumb data is dropped.
Performance traces go through a different hook, so they get `beforeSendTransaction: scrubTransaction`: the same removals plus every query string
(`/geo/reverse?lat=…&lng=…`, the address a rider typed) from the transaction name and each span's description and data.

## Testing it

- `packages/core`: `resolveGate`, `safeNextPath`, `scrubEvent` (all combinations).
- `packages/ui`: `StatusScreen`, `LoadingScreen`, `AppErrorBoundary`.
- `packages/api-client`: `appConfig.get` and `useAppConfig`.
- Both apps: `__tests__/shell.test.tsx` renders the real layouts (plus one stub deep-link screen) with a scripted backend built from the recorded
  responses in `@taxikosmos/core/fixtures` (`test-support/backend.ts`).
- Maestro: `app-launch.yaml` and `navigation-gate.yaml` (not run here: no device).

To see the gates by hand against the local backend: set `APP_RIDER_IOS_MIN_VERSION=9.0.0` (or the platform/app you test) in the backend's
`.env` for the update screen; suspend the account in the admin for the status screen.
