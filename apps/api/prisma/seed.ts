import { PrismaClient } from '@prisma/client';
import { hashKey, newKey } from '../src/keys.js';
const db = new PrismaClient();
try {
  const exists = await db.project.findUnique({ where: { slug: 'demo' } });
  if (exists) {
    console.log('Demo already exists. Existing SDK keys cannot be recovered.');
  } else {
    const keys = ['development', 'staging', 'production'].map((key) => ({
      key,
      client: newKey('client'),
      server: newKey('server'),
    }));
    await db.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { name: 'Orbit Demo', slug: 'demo' },
      });
      for (const item of keys) {
        await tx.environment.create({
          data: {
            projectId: project.id,
            key: item.key,
            clientSdkKeyHash: hashKey(item.client),
            serverSdkKeyHash: hashKey(item.server),
            allowedOrigins: ['http://localhost:3001'],
          },
        });
      }
      const envs = await tx.environment.findMany({
        where: { projectId: project.id },
      });
      for (const sample of [
        {
          key: 'new-checkout',
          description: 'A simpler checkout for the Orbit demo store.',
        },
        {
          key: 'beta-search',
          description: 'Try the next generation of search.',
        },
      ]) {
        const flag = await tx.flag.create({
          data: {
            ...sample,
            projectId: project.id,
            type: 'boolean',
            variations: [false, true],
          },
        });
        for (const env of envs)
          await tx.flagConfig.create({
            data: {
              flagId: flag.id,
              environmentId: env.id,
              enabled: env.key === 'development',
              offVariation: 0,
              fallthrough: 0,
              rules: [],
              salt: flag.id,
            },
          });
        await tx.auditEntry.create({
          data: {
            actor: 'admin',
            action: 'flag.created',
            flagId: flag.id,
            before: {},
            after: {
              key: flag.key,
              type: flag.type,
              variations: [false, true],
              description: flag.description,
            },
          },
        });
      }
    });
    console.log(
      'SDK keys — shown only on creation. Store securely; never commit.',
    );
    for (const item of keys)
      console.log(
        `${item.key}:\n  client=${item.client}\n  server=${item.server}`,
      );
  }
} finally {
  await db.$disconnect();
}
