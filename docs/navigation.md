# Navigation, gating and error handling (M1-T4)

Both apps share one shell, `packages/app-shell`, so the rider and the driver app behave the same way and nothing is copied.

## The route tree

```
src/app/
  _layout.tsx        root: ApiProvider > UiProvider > <AppShell> > Stack; starts Sentry (scrubbed) and holds the splash screen
  (app)/             the signed-in app. _layout.tsx sends anyone signed out to /sign-in?next=<where they were going>
    index.tsx        rider: the home (map, pickup, where to; booking/HomeScreen); driver: placeholder until M6
    ride-options.tsx rider: the ride options (booking/RideOptionsScreen); without a chosen route it goes back to the start
  (auth)/            the signed-out screens. _layout.tsx sends anyone signed in on to `next` (or the start)
    sign-in.tsx      phone number, then the code (`SignInScreen`); hands the install id from `appApi.getDeviceId`
  design-preview.tsx development/staging tool, outside both groups
  map-preview.tsx    development/staging tool: map, location permission, address search (docs/maps.md)
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

## The rider home (M4-T1, `apps/rider/src/booking`)

A map with a pickup, a drop-off and a Continue button. The pickup is the phone's position (reverse-geocoded) until the rider changes it; both ends
are chosen by searching an address or by moving the map under a fixed pin (`Change` / `Where to?` open the picker; confirm takes the address the
maps give for the pin). Saved places and recent destinations are not in the MVP.

With both ends set the route is priced (`POST /trips/fare-estimate`): that answer is also the check that the pickup is in a service zone
(`422 outside_service_area` shows "Not available here" on the home screen, before the ride options). Only the latest route counts. **Continue** says
on the disabled button what is missing (`booking/continueState`): pickup, drop-off, same place, checking prices, not served, no prices, offline.
It opens `/ride-options` with the chosen route and quote in `TripDraft`, asking for a new price first when the one in hand has expired.

## The ride options (M4-T2, `booking/RideOptionsScreen`)

The route on the map and one card per vehicle class with its estimated price range (`formatMoneyRange`, minor units), a "Busy now ×1.5" note when the
multiplier is above 1, the "estimated: the final fare may vary" note and how the rider pays (cash: the MVP; card and wallet wait for their
gateways and screens). Choosing a class only changes the choice (`TripDraft.vehicleClass`; the first class shows as chosen until then, use
`chosenEstimate`) and the fare line; the quote stays the same. The request (M4-T3) sends `draft.quote.quote_id` and the chosen class.

`useQuoteLifecycle` keeps the price true: a quote lives ten minutes, and when it expires (a timer while the screen is open, or the app coming
back) it is asked for again, the new price replaces the old one and the chosen class stays chosen when it is still priced. While it is on its way the cards
stay, marked busy. If it cannot be had the screen says why (no connection / not available / not served) with a retry where retrying can help, and shows
no price at all; a class whose price is zero or broken is left out (`usableEstimates`), and a quote with none usable counts as a failure.

## Signing in (`SignInScreen`, `NameScreen`)

Two steps on one screen: the phone number (`PhoneField`, sent as E.164 with `app`), then the 6-digit code. Signing in saves the session; the
`(auth)` group then moves the person to `next`, so the screens never navigate themselves. The consent line links the terms and privacy pages from
`GET /app-config` (`legal`, per language; a link that is missing or not `https` is left out).

The server answers every bad code with the same 422 ("invalid or has expired"), so the app tells the cases apart itself (`@taxikosmos/core`
`auth`): the code lives `expires_in` seconds (5 minutes), and five wrong guesses lock it (the server's limit). _Wrong_ and _one try left_ keep
the field open; _expired_ and _locked_ disable it and make **Send a new code** the main button. A 429 on either call shows the wait from
`Retry-After` and is not counted as a wrong guess. The request answers 202 without a wait time, so **Send a new code** is offered 60 seconds
after the last one (`DEFAULT_RESEND_COOLDOWN_SECONDS`); a 429 on a number holds that number (not others) until the server's wait is over.

A first-time **rider** (account without a name) gets the gate kind `needs_name`: `NameScreen` is drawn over the app until `PATCH /me` saves a
name (1 to 120 characters). Drivers are never asked; their name comes from the application (M5-T1).

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
