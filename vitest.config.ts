import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
if (existsSync('.env')) loadEnvFile('.env');
export default defineConfig({
  esbuild: {
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/e2e/**'],
    testTimeout: 15000,
    hookTimeout: 60000,
  },
});
