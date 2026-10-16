# Testing

Two layers, both required by the task workflow (`/task`, `/review-task`, `/qa-test` for `M*` cards):

| Layer              | Tool                                                    | Where                         | Runs on                                                                  | Proves                                       |
| ------------------ | ------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| Unit and component | Jest 29 (`jest-expo`) + React Native Testing Library 13 | `__tests__/` next to the code | your computer, no device                                                 | logic, screens, forms, navigation, API calls |
| End to end         | Maestro 2                                               | `maestro/flows/*.yaml`        | an Android emulator/phone or an iOS simulator with the development build | a real user flow on the real app             |

## Jest + React Native Testing Library

```bash
pnpm test                                  # every workspace (core also prints coverage)
pnpm rider test -- --watch                 # one app, watch mode
pnpm rider test -- boot.test.tsx           # one file
```

Rules for every screen and component (checked in `/review-task`):

- Test like a user: render the screen, then `screen.getByRole` / `getByLabelText` / `getByText`, interact with
  `userEvent`, assert what the user sees or the arguments the API client received. Never assert on component state,
  `testID` alone, or snapshots as the main proof.
- Render real routes with `renderRouter('./src/app', { initialUrl })` from `expo-router/testing-library`, so navigation,
  redirects and deep links are exercised, not mocked.
- Fake only the outside world: the network (the API client's transport), native modules (location, camera, secure
  store, notifications), time (`jest.useFakeTimers()`), Sentry. Do not mock the component or hook under test.
- Cover the unhappy paths: validation messages, 401/403/409/422/429 from the API, offline, empty and loading states,
  permission denied.
- Shared packages (`core`, later `api-client`) carry the coverage thresholds in their `jest.config.cjs`.

## Maestro

Flows are YAML files in `maestro/flows/`. Each starts with `appId: ${APP_ID}` so one flow serves the rider and the
driver app; `maestro/scripts/run.sh` passes the right id and name.

```bash
pnpm e2e:check                 # validate the syntax of every flow (no device needed; CI runs this)
pnpm e2e:rider                 # run all flows against the rider development build on the connected device
pnpm e2e:driver
maestro/scripts/run.sh rider --include-tags=smoke
maestro/scripts/run.sh rider maestro/flows/app-launch.yaml
maestro studio                 # inspect the screen and build a flow interactively
```

Prerequisites: Java 17+ and the Maestro CLI (`maestro --version`), an emulator or simulator with the **development
build** installed (see [development.md](development.md)), and the backend running for flows that sign in.

Write flows like the Jest tests: one user goal per flow, assert outcomes (`assertVisible` of the result, not of the tap),
use visible text or accessibility labels rather than coordinates, `clearState: true` for a fresh install, and tag
flows (`smoke`, `auth`, `money`, `matching`). Flows that touch auth, money or matching are mandatory for the task that
adds them (see `rn-rider-driver-app-tasks.md`). For sign-in flows use the backend's `OTP_TEST_CODE` / `OTP_TEST_PHONES`
(only honoured in local, testing and e2e environments) and never a real phone number.

### Install Maestro (Linux or macOS)

```bash
# Java 17+ first (Temurin 21 recommended), then:
curl -Ls "https://get.maestro.mobile.dev" | bash
maestro --version        # 2.11.0 or newer
```

On a machine without admin rights, download `maestro.zip` from
<https://github.com/mobile-dev-inc/maestro/releases>, verify it against `checksums_sha256.txt`, unzip it and put
`maestro/bin` on `PATH`. Set `MAESTRO_CLI_NO_ANALYTICS=1` to turn off usage analytics.

Maestro needs a device. On Linux that means an Android emulator (Android Studio) or a phone with USB debugging; iOS
simulators need macOS. Without a device you can still run `pnpm e2e:check` and all Jest tests.
