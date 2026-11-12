import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth.js';
import { newKey, hashKey } from '../src/keys.js';
if (existsSync('.env')) loadEnvFile('.env');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const schema = `e2e_${randomBytes(8).toString('hex')}`;
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('schema', schema);
const client = newKey('client');
const password = randomBytes(24).toString('hex');
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  ADMIN_PASSWORD_HASH: hashPassword(password),
  SESSION_SECRET: randomBytes(32).toString('hex'),
  ADMIN_ORIGIN: 'http://localhost:3100',
  API_URL: 'http://localhost:4100',
  PORT: '4100',
  E2E_ADMIN_PASSWORD: password,
  E2E_CLIENT_KEY: client,
  VITE_FLAGPOLE_API_URL: 'http://localhost:4100',
  NEXT_TELEMETRY_DISABLED: '1',
};
const db = new PrismaClient({ datasourceUrl: url.toString() });
const children: ChildProcess[] = [];
let logs = '';
function start(command: string, args: string[]) {
  const child = spawn(command, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  children.push(child);
  for (const stream of [child.stdout, child.stderr])
    stream?.on('data', (chunk) => {
      logs = (logs + String(chunk)).slice(-15000);
    });
  return child;
}
async function ready(url: string) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* Wait for the owned local server to bind. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not become ready: ${url}`);
}
let failed = false;
try {
  for (const port of [3100, 3101, 4100]) {
    try {
      await fetch(`http://localhost:${port}`);
      throw new Error(`Port ${port} is in use; stop that server before E2E.`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('in use'))
        throw error;
    }
  }
  execFileSync('pnpm', ['--filter', '@flagpole/api', 'migrate'], {
    env,
    stdio: 'pipe',
  });
  const project = await db.project.create({
    data: { slug: 'demo', name: 'Orbit Demo' },
  });
  for (const key of ['development', 'staging', 'production'])
    await db.environment.create({
      data: {
        projectId: project.id,
        key,
        clientSdkKeyHash: hashKey(
          key === 'development' ? client : newKey('client'),
        ),
        serverSdkKeyHash: hashKey(newKey('server')),
        allowedOrigins: ['http://localhost:3101'],
      },
    });
  start(process.execPath, ['apps/api/dist/main.js']);
  start('pnpm', [
    '--filter',
    '@flagpole/web',
    'exec',
    'next',
    'dev',
    '--port',
    '3100',
  ]);
  start('pnpm', [
    '--filter',
    '@flagpole/example',
    'exec',
    'vite',
    '--host',
    'localhost',
    '--port',
    '3101',
    '--strictPort',
  ]);
  await Promise.all([
    ready('http://localhost:4100/health'),
    ready('http://localhost:3100/login'),
    ready('http://localhost:3101'),
  ]);
  const test = spawn('pnpm', ['exec', 'playwright', 'test'], {
    env,
    stdio: 'inherit',
  });
  const code = await new Promise<number>((resolve) =>
    test.on('exit', (code) => resolve(code ?? 1)),
  );
  failed = code !== 0;
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : 'E2E failed');
} finally {
  for (const child of children) {
    if (child.pid) {
      try {
        if (process.platform === 'win32') child.kill();
        else process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* Already exited. */
      }
    }
  }
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
  if (failed) console.error(logs);
}
process.exitCode = failed ? 1 : 0;
