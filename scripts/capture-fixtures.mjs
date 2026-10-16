#!/usr/bin/env node
/**
 * Captures real /api/v1 responses from the Laravel backend and writes them as fixtures for `@taxikosmos/core`.
 *
 *   node scripts/capture-fixtures.mjs            reset the e2e database, start the backend, record every response
 *   node scripts/capture-fixtures.mjs --emit     only rewrite the TypeScript fixtures from the recorded JSON (no server)
 *
 * The backend runs in its own `e2e` environment against the separate `taxikosmos_e2e` database (never dev or production), with
 * fake maps and SMS providers, a fixed OTP code for the listed test phones and the sign-in tokens replaced below by
 * placeholders. Fixtures are test data: no real person, token or phone number. Re-run it when the backend changes a response, then
 * `pnpm check`: the typed fixtures stop compiling where the app's types no longer match the server.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = process.env.BACKEND_DIR ?? resolve(root, '..', 'taxiKosmos-laravel');
const jsonDir = join(root, 'packages/core/fixtures');
const tsDir = join(root, 'packages/core/src/fixtures');
const PORT = 8001;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;

/** fixture name -> the type its JSON body must satisfy (emitted into packages/core/src/fixtures/index.ts). */
const TYPES = {
  'auth.otp-requested': 'OtpRequested',
  'auth.session.rider': 'AuthSession',
  'auth.session.driver': 'AuthSession',
  'auth.session.rider-no-locale': 'AuthSession',
  'auth.refreshed': 'AuthSession',
  'me.rider': 'MeResponse',
  'me.rider-updated': 'MeResponse',
  'me.rider-no-locale': 'MeResponse',
  'me.driver': 'MeResponse',
  'saved-places.created': 'Data<SavedPlace>',
  'saved-places.list': 'Data<SavedPlace[]>',
  'saved-places.show': 'Data<SavedPlace>',
  'fare-estimate': 'FareQuote',
  'geo.autocomplete': 'GeoAutocompleteResponse',
  'geo.place': 'GeoPlaceResponse',
  'geo.reverse': 'GeoPlaceResponse',
  'geo.route': 'GeoRouteResponse',
  'support.ticket-created': 'Data<SupportTicket>',
  'support.ticket-list': 'Paginated<SupportTicket>',
  'support.ticket-show': 'Data<SupportTicket>',
  'support.message-created': 'Data<SupportMessageReceipt>',
  'devices.registered': 'DeviceResponse',
  'driver.application': 'Data<DriverApplication>',
  'driver.profile': 'Data<DriverApplication>',
  'driver.vehicle-created': 'Data<DriverVehicle>',
  'driver.vehicles': 'Data<DriverVehicle[]>',
  'driver.bank-account-created': 'Data<DriverBankAccount>',
  'driver.bank-accounts': 'Data<DriverBankAccount[]>',
  'driver.document-created': 'Data<DriverDocument>',
  'driver.documents': 'DriverDocumentsResponse',
  'error.unauthenticated': 'ApiErrorBody',
  'error.validation': 'ApiErrorBody',
  'error.forbidden-ability': 'ApiErrorBody',
  'error.not-found': 'ApiErrorBody',
  'error.driver-not-verified': 'ApiErrorBody',
  'error.invalid-code': 'ApiErrorBody',
  'error.rate-limited': 'ApiErrorBody',
};

if (process.argv.includes('--emit')) {
  emitTypeScript();
  process.exit(0);
}

const recorded = {};
let tokens = {};

function run(cmd, args, env = {}) {
  const result = spawnSync(cmd, args, {
    cwd: backend,
    env: { ...process.env, APP_ENV: 'e2e', ...env },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

async function call(name, method, path, { body, token, headers = {}, form, query, keep = true } = {}) {
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));
  const init = { method, headers: { Accept: 'application/json', 'Accept-Language': 'en', ...headers } };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (form) init.body = form;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(url, init);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  const header = Object.fromEntries(
    ['retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining']
      .map((h) => [h, response.headers.get(h)])
      .filter(([, v]) => v !== null),
  );
  console.log(`${String(response.status).padEnd(4)} ${method.padEnd(6)} ${path} ${name ? `-> ${name}` : ''}`);
  if (name && keep) recorded[name] = { status: response.status, headers: header, body: json };
  return { status: response.status, body: json, headers: header };
}

async function signIn(app, phone, name, { locale = 'en', sessionName = `auth.session.${app}` } = {}) {
  const device = `fixture-${app}-device-01`;
  await call(app === 'rider' && locale === 'en' ? 'auth.otp-requested' : null, 'POST', '/auth/otp/request', {
    body: { phone, app },
  });
  // `locale` is optional in the API: leaving it out is a real sign-in, and the person's language stays unset (null) in /me.
  const session = await call(sessionName, 'POST', '/auth/otp/verify', {
    body: { phone, code: '123456', app, device_id: device, ...(locale === null ? {} : { locale }) },
  });
  if (session.status !== 200) throw new Error(`sign-in failed: ${JSON.stringify(session.body)}`);
  if (name) await call(null, 'PATCH', '/me', { token: session.body.access_token, body: { name } });
  return session.body;
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/up`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('backend did not start');
}

function png() {
  // A 1x1 PNG: enough for the backend's content sniffing.
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

async function main() {
  console.log('Resetting the e2e database and creating a zone with fare rules…');
  run('php', ['artisan', 'e2e:reset']);
  run('php', [
    'artisan',
    'e2e:make',
    'zone',
    JSON.stringify({ name: 'Fixture City', code: 'FIX-CITY', lat: 40.18, lng: 44.51, half: 0.2 }),
  ]);
  for (const vehicleClass of ['economy', 'comfort', 'business']) {
    run('php', [
      'artisan',
      'e2e:make',
      'fare_rule',
      JSON.stringify({ zone_code: 'FIX-CITY', vehicle_class: vehicleClass }),
    ]);
  }

  const server = spawn('php', ['artisan', 'serve', '--host=127.0.0.1', `--port=${PORT}`], {
    cwd: backend,
    env: { ...process.env, APP_ENV: 'e2e', PHP_CLI_SERVER_WORKERS: '4' },
    stdio: 'ignore',
  });

  try {
    await waitForServer();
    run('php', ['artisan', 'e2e:make', 'clear_rate_limits']);

    // ---- rider ----
    const rider = await signIn('rider', '+37491770058', 'Fixture Rider');
    tokens.rider = rider;
    const refreshed = await call('auth.refreshed', 'POST', '/auth/refresh', {
      body: { refresh_token: rider.refresh_token },
    });
    const rt = refreshed.body.access_token;
    await call('me.rider', 'GET', '/me', { token: rt });
    await call('me.rider-updated', 'PATCH', '/me', {
      token: rt,
      body: { name: 'Fixture Rider', email: 'fixture.rider@example.com', locale: 'ru' },
    });
    const place = await call('saved-places.created', 'POST', '/saved-places', {
      token: rt,
      body: { label: 'home', name: 'Home', address: 'Abovyan St 1, Yerevan', lat: 40.18, lng: 44.51 },
    });
    await call('saved-places.list', 'GET', '/saved-places', { token: rt });
    await call('saved-places.show', 'GET', `/saved-places/${place.body.data.id}`, { token: rt });
    await call('error.not-found', 'GET', '/saved-places/999999', { token: rt });
    await call('fare-estimate', 'POST', '/trips/fare-estimate', {
      token: rt,
      body: { pickup: { lat: 40.18, lng: 44.51 }, dropoff: { lat: 40.2, lng: 44.53 } },
    });
    await call('error.validation', 'POST', '/trips/fare-estimate', {
      token: rt,
      body: { pickup: { lat: 40.18, lng: 44.51 } },
    });
    const suggestions = await call('geo.autocomplete', 'GET', '/geo/autocomplete', {
      token: rt,
      query: { q: 'Abovyan', lat: 40.18, lng: 44.51, session: 'fixture-session-1' },
    });
    const placeId = suggestions.body.suggestions?.[0]?.place_id;
    if (placeId)
      await call('geo.place', 'GET', `/geo/places/${placeId}`, { token: rt, query: { session: 'fixture-session-1' } });
    await call('geo.reverse', 'GET', '/geo/reverse', { token: rt, query: { lat: 40.18, lng: 44.51 } });
    await call('geo.route', 'GET', '/geo/route', { token: rt, query: { from: '40.18,44.51', to: '40.2,44.53' } });
    const ticket = await call('support.ticket-created', 'POST', '/support-tickets', {
      token: rt,
      headers: { 'Idempotency-Key': '0197a000-0000-7000-8000-000000000001' },
      body: {
        category: 'fare',
        subject: 'Question about my fare',
        message: 'Why was the price higher than estimated?',
      },
    });
    await call('support.ticket-list', 'GET', '/support-tickets', { token: rt });
    await call('support.ticket-show', 'GET', `/support-tickets/${ticket.body.data.id}`, { token: rt });
    await call('support.message-created', 'POST', `/support-tickets/${ticket.body.data.id}/messages`, {
      token: rt,
      body: { body: 'Any update?' },
    });
    await call('devices.registered', 'POST', '/devices', {
      token: rt,
      body: {
        push_token: 'ExponentPushToken[fixtureRiderToken01]',
        platform: 'android',
        locale: 'en',
        app_version: '0.1.0',
      },
    });
    await call('error.forbidden-ability', 'POST', '/driver/application', { token: rt });
    await call('error.unauthenticated', 'GET', '/me', {});
    await call('error.invalid-code', 'POST', '/auth/otp/verify', {
      body: { phone: '+37491770058', code: '000000', app: 'rider', device_id: 'fixture-rider-device-01' },
    });

    // ---- a rider who signed in without choosing a language: /me has "locale": null ----
    const noLocale = await signIn('rider', '+37491770056', null, {
      locale: null,
      sessionName: 'auth.session.rider-no-locale',
    });
    await call('me.rider-no-locale', 'GET', '/me', { token: noLocale.access_token });

    // ---- driver ----
    const driver = await signIn('driver', '+37491770059', 'Fixture Driver');
    tokens.driver = driver;
    const dt = driver.access_token;
    await call('me.driver', 'GET', '/me', { token: dt });
    await call('driver.application', 'POST', '/driver/application', { token: dt });
    const expiry = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
    await call('driver.profile', 'PUT', '/driver/profile', {
      token: dt,
      body: { license_number: 'FIX-12345', license_expiry: expiry },
    });
    await call('driver.vehicle-created', 'POST', '/driver/vehicles', {
      token: dt,
      body: {
        make: 'Toyota',
        model: 'Camry',
        year: 2021,
        color: 'Silver',
        plate_number: 'FIX 123',
        vehicle_class: 'economy',
      },
    });
    await call('driver.vehicles', 'GET', '/driver/vehicles', { token: dt });
    await call('driver.bank-account-created', 'POST', '/driver/bank-accounts', {
      token: dt,
      body: {
        account_holder: 'Fixture Driver',
        bank_name: 'Fixture Bank',
        account_number: 'AM00FIXTURE000123',
        swift: 'FIXTAM22',
      },
    });
    await call('driver.bank-accounts', 'GET', '/driver/bank-accounts', { token: dt });
    const form = new FormData();
    form.set('type', 'license');
    form.set('expires_at', expiry);
    form.set('document_number', 'FIX-12345');
    form.set('file', new Blob([png()], { type: 'image/png' }), 'license.png');
    await call('driver.document-created', 'POST', '/driver/documents', { token: dt, form });
    await call('driver.documents', 'GET', '/driver/documents', { token: dt });
    await call('error.driver-not-verified', 'POST', '/driver/availability', {
      token: dt,
      body: { availability: 'online' },
    });

    // ---- throttling: hammer the sign-in code request until the limiter answers ----
    for (let i = 0; i < 40; i++) {
      const r = await call(null, 'POST', '/auth/otp/request', {
        body: { phone: '+37491770057', app: 'rider' },
        keep: false,
      });
      if (r.status === 429) {
        recorded['error.rate-limited'] = { status: 429, headers: r.headers, body: r.body };
        break;
      }
    }
  } finally {
    server.kill('SIGTERM');
  }

  write();
}

/**
 * Sign-in tokens never reach a fixture, and neither does a clock reading that changes how the app behaves. The access token's expiry is
 * replaced by a far-future constant: recorded as it was, it would "expire" in an hour and every test that signs in with it would start
 * to renew the session first (that is exactly how a test went red the day after recording).
 */
function sanitise(value) {
  if (Array.isArray(value)) return value.map(sanitise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => {
        if (key === 'access_token') return [key, '1|fixture-access-token'];
        if (key === 'refresh_token') return [key, 'fixture-refresh-token'];
        if (key === 'access_token_expires_at') return [key, '2099-01-01T00:00:00+00:00'];
        return [key, sanitise(v)];
      }),
    );
  }
  return value;
}

function write() {
  mkdirSync(jsonDir, { recursive: true });
  for (const [name, entry] of Object.entries(recorded)) {
    writeFileSync(
      join(jsonDir, `${name}.json`),
      JSON.stringify({ status: entry.status, headers: entry.headers, body: sanitise(entry.body) }, null, 2) + '\n',
    );
  }
  const missing = Object.keys(TYPES).filter((name) => !(name in recorded));
  if (missing.length) console.warn(`NOT CAPTURED: ${missing.join(', ')}`);
  emitTypeScript();
}

function identifier(name) {
  return name.replace(/[.-]([a-z])/g, (_, c) => c.toUpperCase());
}

function emitTypeScript() {
  mkdirSync(tsDir, { recursive: true });
  const names = readdirSync(jsonDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
  const used = new Set();
  const blocks = [];

  for (const name of names) {
    const type = TYPES[name];
    if (!type) continue;
    const fixture = JSON.parse(readFileSync(join(jsonDir, `${name}.json`), 'utf8'));
    for (const word of type.match(/[A-Z][A-Za-z]+/g) ?? []) used.add(word);
    blocks.push(
      `/** ${name}: HTTP ${fixture.status}${Object.keys(fixture.headers).length ? ` with ${Object.keys(fixture.headers).join(', ')}` : ''} */\n` +
        `export const ${identifier(name)} = {\n  status: ${fixture.status},\n  headers: ${JSON.stringify(fixture.headers)},\n  body: ${JSON.stringify(fixture.body, null, 2).replace(/\n/g, '\n  ')},\n} satisfies { status: number; headers: Record<string, string>; body: ${type} };\n`,
    );
  }

  const imports = [...used].filter((w) => !['Data', 'Paginated'].includes(w)).sort();
  const header =
    `// Generated by scripts/capture-fixtures.mjs from real backend responses (e2e environment, test data only). Do not edit by hand.\n` +
    `// \`satisfies\` makes the compiler check every recorded response against the app's types: if the backend changes a response,\n` +
    `// re-run the script and \`pnpm typecheck\` shows exactly which type is out of date.\n` +
    `import type { ${[...used]
      .filter((w) => ['Data', 'Paginated'].includes(w))
      .concat(imports)
      .sort()
      .join(', ')} } from '../api/index.ts';\n\n`;
  writeFileSync(join(tsDir, 'index.ts'), header + blocks.join('\n'));
  console.log(`Wrote ${blocks.length} typed fixtures to packages/core/src/fixtures/index.ts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
