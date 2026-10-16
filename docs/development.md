# Local development

Two Expo apps (`apps/rider`, `apps/driver`) share three packages (`packages/core`, `packages/api-client`, `packages/ui`)
in one pnpm + Turborepo monorepo. Both apps talk to the Laravel backend in `../taxiKosmos-laravel` over `/api/v1`.

## Requirements

| Tool    | Version                                                     | Notes                                                                           |
| ------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Node.js | 24.x                                                        | `.nvmrc`; installs refuse other majors (`engine-strict`)                        |
| pnpm    | 9.15.9                                                      | pinned in `package.json` → `packageManager`; `corepack enable pnpm` installs it |
| Android | Android Studio + an emulator, or a phone with USB debugging | for `pnpm rider android`                                                        |
| iOS     | macOS with Xcode, or a cloud build (EAS)                    | iOS cannot be built on Linux or Windows                                         |

The apps use native modules that Expo Go does not include (Sentry, and later maps and background location), so they
run in a **development build**: an app with your native code plus the dev menu. Build it once, then only JS changes
reload.

## First run

```bash
corepack enable pnpm
pnpm install                               # from the repo root, never inside an app
cp apps/rider/.env.example apps/rider/.env
cp apps/driver/.env.example apps/driver/.env
pnpm check                                 # typecheck, lint and tests for every workspace
```

## Start the backend

From `../taxiKosmos-laravel`, serve on all interfaces so an emulator or a phone can reach it:

```bash
php artisan serve --host=0.0.0.0 --port=8000
```

Set `API_URL` in each app's `.env` to the address **the device** sees:

| Where the app runs       | `API_URL`                                                      |
| ------------------------ | -------------------------------------------------------------- |
| iOS simulator (same Mac) | `http://localhost:8000` (the default)                          |
| Android emulator         | `http://10.0.2.2:8000` (the emulator's name for your computer) |
| Phone on the same Wi-Fi  | `http://<your computer's LAN IP>:8000`                         |

Sign-in uses phone OTP. Locally the backend's `SMS_DRIVER=log` writes the code to
`storage/logs/laravel.log`; for a fixed code on test phones set `OTP_TEST_CODE` and `OTP_TEST_PHONES` in the backend's
`.env` (honoured only when `APP_ENV` is `local`, `testing` or `e2e`).

## Run an app

Build and install the development build once per platform (and again after adding a native dependency):

```bash
pnpm rider android        # expo run:android — needs the Android SDK and an emulator or phone
pnpm rider ios            # expo run:ios — macOS only
# or in the cloud, without Android Studio or Xcode:
cd apps/rider && npx eas-cli@latest build --profile development --platform android
```

Then start Metro and open the installed app:

```bash
pnpm rider start          # Metro for the rider app on port 8081
pnpm driver start         # Metro for the driver app on port 8082 (both can run at once)
```

Replace `rider` with `driver` for the driver app. Development builds are installed as **TaxiKosmos (Dev)** and
**TaxiKosmos Driver (Dev)**, with their own bundle ids, so they sit next to the store apps on one phone.

## Everyday commands (repo root)

| Command                                        | What it does                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm check`                                   | typecheck + lint + tests in every workspace (what CI runs)                  |
| `pnpm test` / `pnpm lint` / `pnpm typecheck`   | one of the above                                                            |
| `pnpm e2e:check`                               | validates the Maestro flows' syntax (no device)                             |
| `pnpm e2e:rider` / `pnpm e2e:driver`           | runs the Maestro flows on the connected device                              |
| `pnpm bundle`                                  | bundles both apps for iOS and Android (`expo export`), proving they compile |
| `pnpm check:expo`                              | `expo-doctor` on both apps: SDK-compatible versions and config              |
| `pnpm format`                                  | Prettier                                                                    |
| `pnpm rider <script>` / `pnpm driver <script>` | run a script in one app                                                     |

Add a dependency to one app with `pnpm rider exec expo install <package>` so Expo picks the version that matches SDK 57.
Never add React Native, React or another copy of an Expo module to a shared package's dependencies: Expo supports only
one React Native version in a monorepo.

## Testing

Jest + React Native Testing Library for logic and screens, Maestro for end-to-end flows on a device: see
[testing.md](testing.md).

## Environments

See [environments.md](environments.md) for development / staging / production, every variable, and where each one is
set.
