import { ApiRequestError, getApiError } from '@taxikosmos/core';

import { abortError, buildUrl, isAbortError, send } from '../transport';
import { scriptedFetch, type ReplyOrFn } from './helpers';

const options = (script: ReplyOrFn[], extra: Partial<Parameters<typeof send>[0]> = {}) => {
  const server = scriptedFetch(script);

  return {
    server,
    run: <T>() =>
      send<T>({
        method: 'GET',
        url: 'https://api.example.test/api/v1/me',
        headers: { Accept: 'application/json' },
        timeoutMs: 1_000,
        fetch: server.fetch,
        ...extra,
      }),
  };
};

describe('buildUrl', () => {
  it('puts the version prefix on the path and drops empty query values', () => {
    expect(
      buildUrl('https://api.example.test', '/geo/autocomplete', {
        q: 'Abovyan',
        lat: 40.18,
        lng: undefined,
        session: null,
        empty: '',
        zero: 0,
        off: false,
      }),
    ).toBe('https://api.example.test/api/v1/geo/autocomplete?q=Abovyan&lat=40.18&zero=0&off=false');
  });

  it('accepts a path without its leading slash and encodes special characters', () => {
    expect(buildUrl('https://api.example.test', 'geo/autocomplete', { q: 'Բարև & հայ' })).toBe(
      'https://api.example.test/api/v1/geo/autocomplete?q=%D4%B2%D5%A1%D6%80%D6%87+%26+%D5%B0%D5%A1%D5%B5',
    );
  });
});

describe('send', () => {
  it('returns the parsed body, status and lower-cased headers of a 2xx answer', async () => {
    const { run, server } = options([
      { status: 201, body: { data: { id: 1 } }, headers: { 'X-RateLimit-Remaining': '58' } },
    ]);
    const result = await run<{ data: { id: number } }>();

    expect(result).toEqual({
      status: 201,
      headers: expect.objectContaining({ 'x-ratelimit-remaining': '58' }),
      data: { data: { id: 1 } },
    });
    expect(server.requests[0]?.method).toBe('GET');
  });

  it('answers null for an empty 204', async () => {
    const { run } = options([{ status: 204 }]);

    await expect(run()).resolves.toMatchObject({ status: 204, data: null });
  });

  it('sends a JSON body with its content type, and no content type when there is no body', async () => {
    const post = options([{ status: 200, body: {} }], { method: 'POST', body: { a: 1 } });
    await post.run();
    const get = options([{ status: 200, body: {} }]);
    await get.run();

    expect(post.server.requests[0]).toMatchObject({ body: { a: 1 }, headers: { 'content-type': 'application/json' } });
    expect(get.server.requests[0]?.headers['content-type']).toBeUndefined();
  });

  it('sends a FormData as it is and leaves the multipart content type to fetch', async () => {
    const form = new FormData();
    form.append('type', 'license');
    const { run, server } = options([{ status: 201, body: {} }], {
      method: 'POST',
      body: form,
      headers: { Accept: 'application/json', 'Content-Type': 'should-be-kept-out' },
    });
    await run();

    expect(server.requests[0]?.body).toBe(form);
  });

  it('throws the tagged error for a non-2xx answer, with the status mapped', async () => {
    const { run } = options([{ status: 422, body: { message: 'Bad', errors: { phone: ['Invalid.'] } } }]);
    const error = await run().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(getApiError(error)).toMatchObject({ kind: 'validation', fieldErrors: { phone: ['Invalid.'] } });
  });

  it('maps an HTML error page from a proxy to a server error rather than failing to parse it', async () => {
    const server = scriptedFetch([]);
    const fetchHtml = jest.fn(
      async () => new Response('<html>Bad gateway</html>', { status: 502 }),
    ) as unknown as typeof fetch;
    const error = await send({
      method: 'GET',
      url: 'https://api.example.test/api/v1/me',
      headers: {},
      timeoutMs: 1_000,
      fetch: fetchHtml,
    }).catch((e: unknown) => e);

    expect(getApiError(error)).toEqual({ kind: 'server', status: 502, message: null, code: null });
    expect(server.requests).toHaveLength(0);
  });

  it('refuses a 2xx answer that is not JSON', async () => {
    const fetchText = jest.fn(async () => new Response('OK, thanks', { status: 200 })) as unknown as typeof fetch;
    const error = await send({
      method: 'GET',
      url: 'https://api.example.test/api/v1/me',
      headers: {},
      timeoutMs: 1_000,
      fetch: fetchText,
    }).catch((e: unknown) => e);

    expect(getApiError(error)).toEqual({ kind: 'invalid_response', status: 200, message: null, code: null });
  });

  it('turns a failed connection into a "network" error', async () => {
    const { run } = options(['network-error']);

    expect(getApiError(await run().catch((e: unknown) => e))).toMatchObject({ kind: 'network' });
  });

  it('turns a connection that drops while the body is read into a "network" error', async () => {
    const broken = jest.fn(
      async () =>
        ({
          status: 200,
          headers: new Headers(),
          text: async () => Promise.reject(new TypeError('reset')),
        }) as unknown as Response,
    ) as unknown as typeof fetch;
    const error = await send({
      method: 'GET',
      url: 'https://api.example.test/api/v1/me',
      headers: {},
      timeoutMs: 1_000,
      fetch: broken,
    }).catch((e: unknown) => e);

    expect(getApiError(error)).toMatchObject({ kind: 'network' });
  });

  describe('time limit', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('gives up after the time limit with a "timeout" error and aborts the request', async () => {
      const { run, server } = options(['hang'], { timeoutMs: 5_000 });
      const pending = run().catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(4_999);
      expect(server.mock).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(2);

      expect(getApiError(await pending)).toMatchObject({ kind: 'timeout' });
    });

    it('does not time out an answer that arrives in time, and leaves no timer behind', async () => {
      const { run } = options([{ status: 200, body: {} }], { timeoutMs: 5_000 });
      await run();

      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('cancelling', () => {
    it('throws an AbortError, not an API error, when the caller cancels (a screen closing)', async () => {
      const controller = new AbortController();
      const { run } = options(['hang'], { signal: controller.signal });
      const pending = run().catch((e: unknown) => e);
      controller.abort();
      const error = await pending;

      expect(isAbortError(error)).toBe(true);
      expect(error).not.toBeInstanceOf(ApiRequestError);
    });

    it('does not even send when already cancelled', async () => {
      const controller = new AbortController();
      controller.abort();
      const { run, server } = options([{ status: 200, body: {} }], { signal: controller.signal });

      expect(isAbortError(await run().catch((e: unknown) => e))).toBe(true);
      expect(server.mock).not.toHaveBeenCalled();
    });

    it('recognises its own abort error and nothing else', () => {
      expect(isAbortError(abortError())).toBe(true);
      expect(isAbortError(new Error('x'))).toBe(false);
      expect(isAbortError('AbortError')).toBe(false);
    });
  });
});
