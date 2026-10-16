# TaxiKosmos mobile

The **rider** and **driver** apps for TaxiKosmos: two Expo (React Native) apps in one pnpm + Turborepo monorepo,
talking to the Laravel backend's `/api/v1`.

```
apps/
  rider/          Expo app: com.taxikosmos.rider, taxirider://
  driver/         Expo app: com.taxikosmos.driver, taxidriver://
packages/
  core/           framework-free shared code: environment and identity rules, API types (M1-T2)
  api-client/     typed /api/v1 client and realtime socket (M1-T2)
  ui/             design system ported from RiderTaxiAppTemplate (M1-T3)
docs/
  development.md  run the apps against the local backend
  environments.md development / staging / production, variables and secrets
  testing.md      Jest + React Native Testing Library, Maestro
maestro/
  flows/          end-to-end flows (YAML), run on a device with the development build
```

Stack: Expo SDK 57, React Native 0.86, React 19.2, TypeScript (strict), Expo Router, Jest + Testing Library, Sentry,
EAS Build. The task plan is `rn-rider-driver-app-tasks.md` in the TaxiKosmos workspace (cards `M*-T*` on the Trello
board).

```bash
corepack enable pnpm
pnpm install
pnpm check        # typecheck, lint, tests: what CI runs
```

Then follow [docs/development.md](docs/development.md).
