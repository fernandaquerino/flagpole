import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { FlagpoleClient } from '../src/index.js';
const endpoint = 'http://flags.test/sdk/v1/evaluate';
const result = (value: boolean) => ({
  flags: { checkout: { value, reason: 'FALLTHROUGH' } },
});
const server = setupServer(
  http.post(endpoint, () => HttpResponse.json(result(true))),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const client = (
  options: Partial<ConstructorParameters<typeof FlagpoleClient>[0]> = {},
) =>
  new FlagpoleClient({
    clientKey: 'client',
    apiUrl: 'http://flags.test',
    context: { key: 'opaque' },
    pollInterval: 0,
    ...options,
  });
describe('JS client', () => {
  it('returns defaults, evaluates and retains last values on errors', async () => {
    const c = client();
    expect(c.getFlag('checkout', false)).toBe(false);
    await c.refresh();
    expect(c.getFlag('checkout', false)).toBe(true);
    server.use(
      http.post(endpoint, () => new HttpResponse(null, { status: 503 })),
    );
    await c.refresh();
    expect(c.getFlag('checkout', false)).toBe(true);
    expect(c.getSnapshot().error).toBeInstanceOf(Error);
    c.stop();
  });
  it('validates responses and handles deleted flags and type mismatches', async () => {
    const c = client({ initialFlags: { checkout: true } });
    expect(c.getFlag('checkout', 'fallback')).toBe('fallback');
    server.use(http.post(endpoint, () => HttpResponse.json({ bad: true })));
    await c.refresh();
    expect(c.getSnapshot().flags.checkout).toBe(true);
    server.use(http.post(endpoint, () => HttpResponse.json({ flags: {} })));
    await c.refresh();
    expect(c.getFlag('checkout', false)).toBe(false);
    c.stop();
  });
  it('polls, subscribes and stops fetching after disposal', async () => {
    let count = 0;
    server.use(
      http.post(endpoint, () => {
        count++;
        return HttpResponse.json(result(true));
      }),
    );
    const c = client({ pollInterval: 20 });
    let notifications = 0;
    const unsubscribe = c.subscribe(() => notifications++);
    c.start();
    await new Promise((r) => setTimeout(r, 110));
    c.stop();
    const stopped = count;
    await new Promise((r) => setTimeout(r, 70));
    expect(count).toBe(stopped);
    expect(count).toBeGreaterThan(1);
    expect(notifications).toBeGreaterThan(0);
    unsubscribe();
  });
  it('discards a late response after context changes', async () => {
    server.use(
      http.post(endpoint, async ({ request }) => {
        const body = (await request.json()) as { context: { key: string } };
        if (body.context.key === 'old') await delay(80);
        return HttpResponse.json(result(body.context.key === 'old'));
      }),
    );
    const c = client({ context: { key: 'old' } });
    c.start();
    await new Promise((r) => setTimeout(r, 10));
    c.setContext({ key: 'new' });
    await new Promise((r) => setTimeout(r, 120));
    expect(c.getFlag('checkout', true)).toBe(false);
    c.stop();
  });
  it('times out requests without throwing', async () => {
    server.use(
      http.post(endpoint, async () => {
        await delay(100);
        return HttpResponse.json(result(true));
      }),
    );
    const c = client({ requestTimeout: 10 });
    await c.refresh();
    expect(c.getSnapshot().error).not.toBeNull();
    c.stop();
  });
});
