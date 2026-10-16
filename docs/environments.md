# Environments, variables and secrets

Each app is built for one environment. `apps/*/app.config.ts` calls `buildExpoConfig()` from `packages/core`, which
reads the variables below, refuses an invalid combination, and writes the public values into the app's manifest
(`expo.extra.app`). The running app reads them back with `readPublicConfig()`.

| Environment   | EAS build profile                      | EAS environment | Installed as         | Bundle id / scheme                                     |
| ------------- | -------------------------------------- | --------------- | -------------------- | ------------------------------------------------------ |
| `development` | `development`, `development-simulator` | development     | TaxiKosmos (Dev)     | `com.taxikosmos.rider.dev`, `taxirider-dev://`         |
| `staging`     | `preview`                              | preview         | TaxiKosmos (Staging) | `com.taxikosmos.rider.staging`, `taxirider-staging://` |
| `production`  | `production`                           | production      | TaxiKosmos           | `com.taxikosmos.rider`, `taxirider://`                 |

The driver app is the same with `driver` (`com.taxikosmos.driver`, `taxidriver://`, "TaxiKosmos Driver").

## Variables

| Variable                       | Needed by                       | Rules                                                                                                                                                    | Visibility                      |
| ------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `APP_ENV`                      | every build                     | `development` (default), `staging`, `production`; set per profile in `eas.json`                                                                          | plain                           |
| `API_URL`                      | every build                     | origin of the Laravel backend, the app adds `/api/v1`; required and **https** for staging and production; default `http://localhost:8000` in development | plain                           |
| `REALTIME_URL`                 | live updates (M4-T4, M6-T2)     | address of the Socket.io service; **optional**: empty means the app polls the API instead; https or wss in staging and production                        | plain                           |
| `SENTRY_DSN`                   | production (optional elsewhere) | https; without it crash reporting is off                                                                                                                 | plain (it ships inside the app) |
| `STRIPE_PUBLISHABLE_KEY`       | card payments (M4-T7)           | must start with `pk_`; `pk_live_` only in production, never in staging/development                                                                       | plain                           |
| `GOOGLE_MAPS_ANDROID_API_KEY`  | maps (M3-T1)                    | restrict it to the app's package and signing certificate in Google Cloud                                                                                 | sensitive                       |
| `EAS_PROJECT_ID`               | cloud builds and updates        | the id `eas init` prints for that app                                                                                                                    | plain                           |
| `EXPO_OWNER`                   | cloud builds                    | the Expo account or organisation that owns the project                                                                                                   | plain                           |
| `SENTRY_ORG`, `SENTRY_PROJECT` | source-map upload               | when both are set, the Sentry plugin uploads source maps                                                                                                 | plain                           |
| `SENTRY_AUTH_TOKEN`            | source-map upload               | **secret**: read only by the Sentry plugin during the build, never written into the app                                                                  | secret                          |

Everything written into the app is public: anyone can unpack an APK or IPA. That is why the config refuses a Stripe
secret key and never copies build-only values such as `SENTRY_AUTH_TOKEN` into the manifest (tested in
`packages/core/src/config/__tests__/expo-config.test.ts`).

## Where values live

- **Local:** `apps/<app>/.env` (git-ignored; copy from `.env.example`). Expo loads it automatically.
- **Cloud builds:** EAS environment variables, per app project and per environment (development / preview /
  production), e.g. `npx eas-cli@latest env:create --environment production --name API_URL --value https://... --visibility plaintext`.
  The build profile's `environment` key in `eas.json` picks the set; its `env.APP_ENV` picks our environment.
- **Never** in the repository: `.env`, `.env.*` (except `.env.example`), keystores, `google-services.json` and
  provisioning files are all git-ignored.

## One-time cloud setup (needs the project owner's accounts)

1. **EAS:** `npx eas-cli@latest login`, then in each app folder `npx eas-cli@latest init` (creates the Expo project
   `taxikosmos-rider` / `taxikosmos-driver`). Store the printed id as the `EAS_PROJECT_ID` variable and the account as
   `EXPO_OWNER`.
2. **Sentry:** create one React Native project per app, then set `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` (plain)
   and `SENTRY_AUTH_TOKEN` (secret) for each EAS project.
3. **Build:** `npx eas-cli@latest build --profile development --platform all` in each app folder.
