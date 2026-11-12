import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { hashPassword } from '../src/auth.js';
import { hashKey, newKey } from '../src/keys.js';
const clientKey = newKey('client');
const serverKey = newKey('server');
const schema = `test_${randomBytes(8).toString('hex')}`;
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl)
  throw new Error(
    'DATABASE_URL required: integration tests use real Postgres.',
  );
const url = new URL(baseUrl);
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.toString();
process.env.ADMIN_PASSWORD_HASH = hashPassword('test-only-password');
process.env.SESSION_SECRET = randomBytes(32).toString('hex');
process.env.ADMIN_ORIGIN = 'http://localhost:3000';
let app: INestApplication;
let db: PrismaClient;
let cookie: string;
let envId: string;
const config = {
  enabled: true,
  offVariation: 0,
  fallthrough: 1,
  rules: [],
  expectedVersion: 1,
};
const api = () => request(app.getHttpServer());
const admin = (method: 'get' | 'post' | 'patch' | 'put', path: string) =>
  api()[method](path).set('Cookie', cookie).set('X-Flagpole-CSRF', '1');
beforeAll(async () => {
  execFileSync('pnpm', ['--filter', '@flagpole/api', 'migrate'], {
    env: process.env,
    stdio: 'pipe',
  });
  const module = await import('../src/database.js');
  db = module.db;
  const project = await db.project.create({
    data: { name: 'Test project', slug: 'test' },
  });
  const env = await db.environment.create({
    data: {
      key: 'development',
      projectId: project.id,
      clientSdkKeyHash: hashKey(clientKey),
      serverSdkKeyHash: hashKey(serverKey),
      allowedOrigins: ['http://localhost:3001'],
    },
  });
  envId = env.id;
  app = await (await import('../src/app.js')).createApp();
  const login = await api()
    .post('/api/auth/login')
    .set('X-Flagpole-CSRF', '1')
    .send({ password: 'test-only-password' })
    .expect(201);
  cookie = login.headers['set-cookie'][0];
});
afterAll(async () => {
  await app?.close();
  if (db) {
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
  }
});
describe('admin API with PostgreSQL', () => {
  it('exposes health and rejects unauthorized and cross-origin requests', async () => {
    await api().get('/health').expect(200);
    await api().get('/api/projects/test/flags').expect(401);
    await api()
      .post('/api/auth/login')
      .send({ password: 'test-only-password' })
      .expect(403);
    await api()
      .post('/api/auth/login')
      .set('X-Flagpole-CSRF', '1')
      .send({ password: 'wrong' })
      .expect(401);
    await admin('get', '/api/projects')
      .set('Origin', 'https://evil.example')
      .expect(403);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });
  it('creates config and audit atomically, rejects duplicate and malformed flags', async () => {
    const body = {
      key: 'checkout',
      type: 'boolean',
      variations: [false, true],
      description: 'Made up',
    };
    const r = await admin('post', '/api/projects/test/flags')
      .send(body)
      .expect(201);
    expect(r.body.configs).toHaveLength(1);
    await admin('post', '/api/projects/test/flags')
      .send(body)
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('FLAG_KEY_TAKEN'));
    await admin('post', '/api/projects/test/flags')
      .send({ ...body, key: 'bad', variations: ['a', 'b'] })
      .expect(400);
    expect(await db.auditEntry.count()).toBe(1);
  });
  it('allows exactly one concurrent version update and one audit', async () => {
    const path = '/api/projects/test/flags/checkout/environments/development';
    const responses = await Promise.all([
      admin('put', path).send(config),
      admin('put', path).send(config),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(responses.find((r) => r.status === 409)?.body.code).toBe(
      'STALE_FLAG_VERSION',
    );
    expect(await db.auditEntry.count()).toBe(2);
    expect((await db.flagConfig.findFirstOrThrow()).version).toBe(2);
  });
  it('rejects invalid weights and references without changing state', async () => {
    const path = '/api/projects/test/flags/checkout/environments/development';
    await admin('put', path)
      .send({
        ...config,
        expectedVersion: 2,
        fallthrough: { buckets: [{ variation: 1, weight: 10 }] },
      })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe('INVALID_ROLLOUT_WEIGHTS'));
    await admin('put', path)
      .send({ ...config, expectedVersion: 2, offVariation: 5 })
      .expect(400);
    expect(await db.auditEntry.count()).toBe(2);
  });
  it('rolls the mutation back when writing audit fails', async () => {
    await db.$executeRawUnsafe(
      `CREATE FUNCTION fail_test_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$ LANGUAGE plpgsql`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER fail_test_audit BEFORE INSERT ON "AuditEntry" FOR EACH ROW EXECUTE FUNCTION fail_test_audit()`,
    );
    try {
      await admin(
        'put',
        '/api/projects/test/flags/checkout/environments/development',
      )
        .send({ ...config, enabled: false, expectedVersion: 2 })
        .expect(500);
      expect((await db.flagConfig.findFirstOrThrow()).version).toBe(2);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER fail_test_audit ON "AuditEntry"',
      );
    }
  });
  it('edits metadata, invalidates config versions, paginates and filters audit', async () => {
    await admin('patch', '/api/projects/test/flags/checkout')
      .send({ description: 'Updated' })
      .expect(200);
    expect((await db.flagConfig.findFirstOrThrow()).version).toBe(3);
    const first = await admin('get', '/api/projects/test/audit?limit=1').expect(
      200,
    );
    expect(first.body.nextCursor).toBeTruthy();
    const second = await admin(
      'get',
      `/api/projects/test/audit?limit=1&cursor=${first.body.nextCursor}`,
    ).expect(200);
    expect(second.body.entries[0].id).not.toBe(first.body.entries[0].id);
    const filtered = await admin(
      'get',
      '/api/projects/test/audit?env=development&flag=checkout',
    ).expect(200);
    expect(filtered.body.entries).toHaveLength(1);
    expect(filtered.body.entries[0].environmentId).toBe(envId);
    await expect(
      db.auditEntry.updateMany({ data: { actor: 'tampered' } }),
    ).rejects.toThrow('append-only');
  });
  it('archives and hides the flag', async () => {
    await admin('post', '/api/projects/test/flags/checkout/archive').expect(
      201,
    );
    await admin('get', '/api/projects/test/flags/checkout').expect(404);
    const list = await admin('get', '/api/projects/test/flags').expect(200);
    expect(list.body).toHaveLength(0);
  });
});

describe('SDK endpoints', () => {
  it('enforces key roles and environment-specific CORS', async () => {
    await api()
      .post('/sdk/v1/evaluate')
      .send({ context: { key: 'opaque' } })
      .expect(401)
      .expect((r) => expect(r.body.code).toBe('SDK_KEY_INVALID'));
    await api()
      .get('/sdk/v1/flags')
      .set('Authorization', `Bearer ${clientKey}`)
      .expect(401);
    await api()
      .post('/sdk/v1/evaluate')
      .set('Authorization', `Bearer ${serverKey}`)
      .send({ context: { key: 'opaque' } })
      .expect(401);
    await api()
      .post('/sdk/v1/evaluate')
      .set('Authorization', `Bearer ${clientKey}`)
      .set('Origin', 'https://evil.example')
      .send({ context: { key: 'opaque' } })
      .expect(403);
    await api()
      .options('/sdk/v1/evaluate')
      .set('Origin', 'http://localhost:3001')
      .expect(204)
      .expect('Access-Control-Allow-Origin', 'http://localhost:3001');
    await api()
      .options('/sdk/v1/evaluate')
      .set('Origin', 'https://evil.example')
      .expect(403);
  });
  it('evaluates without retaining context, excludes archived flags, and isolates environments', async () => {
    await admin('post', '/api/projects/test/flags')
      .send({ key: 'sdk-flag', type: 'boolean', variations: [false, true] })
      .expect(201);
    const auditCount = await db.auditEntry.count();
    const response = await api()
      .post('/sdk/v1/evaluate')
      .set('Authorization', `Bearer ${clientKey}`)
      .set('Origin', 'http://localhost:3001')
      .send({ context: { key: 'never-persist-this', plan: 'pro' } })
      .expect(201)
      .expect('Access-Control-Allow-Origin', 'http://localhost:3001')
      .expect('Cache-Control', 'no-store');
    expect(response.body.flags['sdk-flag']).toMatchObject({
      value: false,
      reason: 'OFF',
    });
    expect(response.body.flags.checkout).toBeUndefined();
    expect(await db.auditEntry.count()).toBe(auditCount);
    expect(JSON.stringify(await db.auditEntry.findMany())).not.toContain(
      'never-persist-this',
    );
    await api()
      .post('/sdk/v1/evaluate')
      .set('Authorization', `Bearer ${clientKey}`)
      .send({ context: { plan: 'pro' } })
      .expect(400);
    const other = newKey('client');
    const p = await db.project.create({
      data: { slug: 'other', name: 'Other' },
    });
    await db.environment.create({
      data: {
        key: 'production',
        projectId: p.id,
        clientSdkKeyHash: hashKey(other),
        serverSdkKeyHash: hashKey(newKey('server')),
        allowedOrigins: ['https://other.example'],
      },
    });
    const isolated = await api()
      .post('/sdk/v1/evaluate')
      .set('Authorization', `Bearer ${other}`)
      .send({ context: { key: 'x' } })
      .expect(201);
    expect(isolated.body.flags).toEqual({});
    await api()
      .post('/sdk/v1/evaluate')
      .set('Authorization', `Bearer ${other}`)
      .set('Origin', 'http://localhost:3001')
      .send({ context: { key: 'x' } })
      .expect(403);
  });
  it('returns server definitions and validates ETags after config changes', async () => {
    const first = await api()
      .get('/sdk/v1/flags')
      .set('Authorization', `Bearer ${serverKey}`)
      .expect(200);
    expect(first.body.flags).toHaveLength(1);
    expect(first.text).not.toContain('SdkKeyHash');
    await api()
      .get('/sdk/v1/flags')
      .set('Authorization', `Bearer ${serverKey}`)
      .set('If-None-Match', first.headers.etag)
      .expect(304);
    await admin(
      'put',
      '/api/projects/test/flags/sdk-flag/environments/development',
    )
      .send(config)
      .expect(200);
    const second = await api()
      .get('/sdk/v1/flags')
      .set('Authorization', `Bearer ${serverKey}`)
      .set('If-None-Match', first.headers.etag)
      .expect(200);
    expect(second.headers.etag).not.toBe(first.headers.etag);
  });
});
