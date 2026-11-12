import './dom.js';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { StrictMode } from 'react';
import {
  FlagpoleProvider,
  useFlag,
  useFlags,
  useFlagpoleStatus,
} from '../src/index.js';
const server = setupServer(
  http.post('http://flags.test/sdk/v1/evaluate', async ({ request }) => {
    const body = (await request.json()) as { context: { plan: string } };
    return HttpResponse.json({
      flags: {
        checkout: { value: body.context.plan === 'pro', reason: 'RULE_MATCH' },
      },
    });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
function Child() {
  const status = useFlagpoleStatus();
  const enabled = useFlag('checkout', false);
  const flags = useFlags();
  return (
    <div>
      <span data-testid="error">{status.error?.message}</span>
      <span data-testid="flag">{String(enabled)}</span>
      <span data-testid="count">{Object.keys(flags).length}</span>
    </div>
  );
}
const props = {
  apiUrl: 'http://flags.test',
  clientKey: 'client',
  pollInterval: 0,
};
it('provides defaults outside the provider without throwing', () => {
  render(<Child />);
  expect(screen.getByTestId('flag').textContent).toBe('false');
});
it('fetches on mount and context change under StrictMode', async () => {
  const view = render(
    <StrictMode>
      <FlagpoleProvider {...props} context={{ key: 'visitor', plan: 'pro' }}>
        <Child />
      </FlagpoleProvider>
    </StrictMode>,
  );
  await waitFor(() =>
    expect(screen.getByTestId('flag').textContent).toBe('true'),
  );
  view.rerender(
    <StrictMode>
      <FlagpoleProvider {...props} context={{ key: 'visitor', plan: 'free' }}>
        <Child />
      </FlagpoleProvider>
    </StrictMode>,
  );
  await waitFor(() =>
    expect(screen.getByTestId('count').textContent).toBe('1'),
  );
  expect(screen.getByTestId('flag').textContent).toBe('false');
});
it('renders initial flags during SSR and keeps them when fetching fails', async () => {
  server.use(
    http.post(
      'http://flags.test/sdk/v1/evaluate',
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  const tree = (
    <FlagpoleProvider
      {...props}
      context={{ key: 'visitor' }}
      initialFlags={{ checkout: true }}
    >
      <Child />
    </FlagpoleProvider>
  );
  expect(renderToString(tree)).toContain('true');
  render(tree);
  await waitFor(() =>
    expect(screen.getByTestId('flag').textContent).toBe('true'),
  );
});
