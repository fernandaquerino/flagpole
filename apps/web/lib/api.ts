import type { Config, Flag } from '@flagpole/shared';
export type Environment = { id: string; key: string; allowedOrigins: string[] };
export type Project = {
  id: string;
  name: string;
  slug: string;
  environments: Environment[];
};
export type StoredConfig = Config & { environmentId: string; flagId: string };
export type StoredFlag = Flag & { id: string; configs: StoredConfig[] };
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Flagpole-CSRF': '1',
      ...options.headers,
    },
    cache: 'no-store',
  });
  const body = await res.json();
  if (!res.ok) {
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      !path.includes('/auth/')
    )
      window.location.assign('/login');
    throw new ApiError(
      body.code ?? 'REQUEST_FAILED',
      body.message ?? 'Request failed. Try again.',
    );
  }
  return body as T;
}
export const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Request failed. Try again.';
export const configBody = (config: Config) => ({
  enabled: config.enabled,
  offVariation: config.offVariation,
  fallthrough: config.fallthrough,
  rules: config.rules,
  expectedVersion: config.version,
});
