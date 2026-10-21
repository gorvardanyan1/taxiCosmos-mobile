import { resolveGate, safeNextPath, type GateInput } from '../index.ts';

const ready = { state: 'ready' as const, forceUpdate: false };
const active = { state: 'ready' as const, status: 'active' as const };
const input = (overrides: Partial<GateInput> = {}): GateInput => ({
  session: 'signed_in',
  config: ready,
  me: active,
  ...overrides,
});

describe('resolveGate', () => {
  it('lets a signed-in person with an active account into the app', () => {
    expect(resolveGate(input())).toEqual({ kind: 'ready' });
  });

  it('lets a signed-out person see the sign-in screens', () => {
    expect(resolveGate(input({ session: 'signed_out', me: { state: 'idle' } }))).toEqual({ kind: 'signed_out' });
  });

  describe('waits while something it needs is still on its way', () => {
    it.each([
      ['the saved session is not read yet', input({ session: 'unknown', me: { state: 'idle' } })],
      ['the app config was not asked yet', input({ config: { state: 'idle' } })],
      ['the app config is loading', input({ config: { state: 'loading' } })],
      ['the account is loading', input({ me: { state: 'loading' } })],
      ['the account was not asked yet', input({ me: { state: 'idle' } })],
    ])('%s', (_, given) => {
      expect(resolveGate(given)).toEqual({ kind: 'loading' });
    });
  });

  describe('an outdated build is stopped before anything else', () => {
    const outdated = { state: 'ready' as const, forceUpdate: true };

    it.each([
      ['signed out', input({ config: outdated, session: 'signed_out', me: { state: 'idle' } })],
      ['signed in with an active account', input({ config: outdated })],
      ['signed in with a suspended account', input({ config: outdated, me: { state: 'ready', status: 'suspended' } })],
      ['before the saved session is even read', input({ config: outdated, session: 'unknown', me: { state: 'idle' } })],
      ['while the account is still loading', input({ config: outdated, me: { state: 'loading' } })],
    ])('%s', (_, given) => {
      expect(resolveGate(given)).toEqual({ kind: 'update_required' });
    });
  });

  it('does not stop a build when the config could not be fetched: a server outage must not lock people out', () => {
    expect(resolveGate(input({ config: { state: 'failed' } }))).toEqual({ kind: 'ready' });
    expect(resolveGate(input({ config: { state: 'failed' }, session: 'signed_out', me: { state: 'idle' } }))).toEqual({
      kind: 'signed_out',
    });
  });

  describe('an account that may not use the app gets a status screen, never the app', () => {
    it.each(['suspended', 'deactivated', 'pending_deletion'] as const)('%s', (status) => {
      expect(resolveGate(input({ me: { state: 'ready', status } }))).toEqual({ kind: 'blocked', reason: status });
    });
  });

  it('does not guess when the account could not be loaded', () => {
    expect(resolveGate(input({ me: { state: 'failed' } }))).toEqual({ kind: 'account_unavailable' });
    expect(resolveGate(input({ me: { state: 'ready' } }))).toEqual({ kind: 'account_unavailable' });
  });
});

describe('safeNextPath', () => {
  it.each(['/', '/trips/42', '/trips/42?tab=receipt', '/(app)/settings', '/a/b#section'])('follows %s', (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it('takes the first value when the router hands over a list', () => {
    expect(safeNextPath(['/trips/42', '/other'])).toBe('/trips/42');
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a number', 42],
    ['an object', { a: 1 }],
    ['an empty string', ''],
    ['an empty list', []],
    ['a relative path', 'trips/42'],
    ['a full URL', 'https://evil.test/phish'],
    ['another scheme', 'javascript:alert(1)'],
    ['a deep link into another app', 'taxidriver://trips/1'],
    ['a protocol-relative URL', '//evil.test/x'],
    ['a backslash trick', '/\\evil.test'],
    ['a control character', '/trips/4\n2'],
    ['a NUL byte', '/trips/\u00002'],
    ['the sign-in screen itself', '/sign-in'],
    ['the sign-in screen with a query', '/sign-in?next=/trips/1'],
    ['a screen below sign-in', '/sign-in/code'],
    ['the auth group by name', '/(auth)/sign-in'],
    ['a path that is far too long', `/${'a'.repeat(400)}`],
  ])('refuses %s', (_, raw) => {
    expect(safeNextPath(raw)).toBeNull();
  });

  it('keeps a path that merely contains "sign-in" in a longer name', () => {
    expect(safeNextPath('/sign-ins')).toBe('/sign-ins');
  });
});
