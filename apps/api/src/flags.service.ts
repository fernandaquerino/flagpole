import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  configSchema,
  flagSchema,
  validConfigReferences,
  type Flag,
  type Config,
} from '@flagpole/shared';
import { db } from './database.js';
import { ApiError } from './errors.js';
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const updateSchema = z
  .object({
    description: z.string().max(2000).optional(),
    variations: flagSchema.innerType().shape.variations.optional(),
  })
  .strict();
const replaceSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    enabled: z.boolean(),
    offVariation: z.number().int().nonnegative(),
    fallthrough: configSchema.innerType().shape.fallthrough,
    rules: configSchema.innerType().shape.rules,
  })
  .strict();
@Injectable()
export class FlagsService {
  async projects() {
    return db.project.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        environments: { select: { id: true, key: true, allowedOrigins: true } },
      },
      orderBy: { name: 'asc' },
    });
  }
  async project(slug: string) {
    const p = await db.project.findUnique({
      where: { slug },
      include: { environments: true },
    });
    if (!p) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found.', 404);
    return p;
  }
  async list(slug: string) {
    const p = await this.project(slug);
    return db.flag.findMany({
      where: { projectId: p.id, archivedAt: null },
      include: { configs: true },
      orderBy: { key: 'asc' },
    });
  }
  async detail(slug: string, key: string) {
    const p = await this.project(slug);
    const flag = await db.flag.findUnique({
      where: { projectId_key: { projectId: p.id, key } },
      include: { configs: true },
    });
    if (!flag || flag.archivedAt)
      throw new ApiError('FLAG_NOT_FOUND', 'Flag not found.', 404);
    return flag;
  }
  async create(slug: string, input: unknown) {
    const data = flagSchema
      .innerType()
      .omit({ archivedAt: true })
      .strict()
      .superRefine((f, c) => {
        if (f.variations.some((v) => typeof v !== f.type))
          c.addIssue({
            code: 'custom',
            message: 'Variations must match flag type',
          });
      })
      .parse(input);
    const p = await this.project(slug);
    return db.$transaction(async (tx) => {
      const flag = await tx.flag.create({ data: { ...data, projectId: p.id } });
      for (const env of p.environments)
        await tx.flagConfig.create({
          data: {
            flagId: flag.id,
            environmentId: env.id,
            enabled: false,
            offVariation: 0,
            fallthrough: 1,
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
          after: json(flag),
        },
      });
      return tx.flag.findUniqueOrThrow({
        where: { id: flag.id },
        include: { configs: true },
      });
    });
  }
  async edit(slug: string, key: string, input: unknown) {
    const changes = updateSchema.parse(input);
    const target = await this.detail(slug, key);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Flag" WHERE id = ${target.id} FOR UPDATE`;
      const before = await tx.flag.findUniqueOrThrow({
        where: { id: target.id },
        include: { configs: true },
      });
      if (before.archivedAt)
        throw new ApiError('FLAG_NOT_FOUND', 'Flag archived.', 404);
      const parsed = flagSchema.parse({
        ...before,
        ...changes,
        archivedAt: null,
      });
      if (
        before.configs.some(
          (c) => !validConfigReferences(parsed, configSchema.parse(c)),
        )
      )
        throw new ApiError(
          'INVALID_VARIATIONS',
          'Variations are still referenced by a config.',
        );
      const after = await tx.flag.update({
        where: { id: target.id },
        data: changes,
      });
      // A variation edit changes evaluation, so invalidate every config version.
      await tx.flagConfig.updateMany({
        where: { flagId: target.id },
        data: { version: { increment: 1 } },
      });
      await tx.auditEntry.create({
        data: {
          actor: 'admin',
          action: 'flag.updated',
          flagId: target.id,
          before: json(before),
          after: json({
            ...after,
            configs: await tx.flagConfig.findMany({
              where: { flagId: target.id },
            }),
          }),
        },
      });
      return tx.flag.findUniqueOrThrow({
        where: { id: target.id },
        include: { configs: true },
      });
    });
  }
  async replace(slug: string, key: string, envKey: string, input: unknown) {
    const data = replaceSchema.parse(input);
    const p = await this.project(slug);
    const env = p.environments.find((e) => e.key === envKey);
    if (!env)
      throw new ApiError(
        'ENVIRONMENT_NOT_FOUND',
        'Environment not found.',
        404,
      );
    const target = await this.detail(slug, key);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Flag" WHERE id = ${target.id} FOR UPDATE`;
      const flag = await tx.flag.findUniqueOrThrow({
        where: { id: target.id },
      });
      if (flag.archivedAt)
        throw new ApiError('FLAG_NOT_FOUND', 'Flag archived.', 404);
      const where = {
        flagId_environmentId: { flagId: target.id, environmentId: env.id },
      };
      const before = await tx.flagConfig.findUniqueOrThrow({ where });
      if (before.version !== data.expectedVersion)
        throw new ApiError(
          'STALE_FLAG_VERSION',
          'This flag changed. Reload before saving.',
          409,
        );
      const { expectedVersion, ...config } = data;
      const candidate = configSchema.parse({
        ...config,
        salt: before.salt,
        version: expectedVersion + 1,
      });
      if (
        !validConfigReferences(
          flagSchema.parse({ ...flag, archivedAt: null }),
          candidate,
        )
      )
        throw new ApiError('INVALID_VARIATION', 'Variation does not exist.');
      const after = await tx.flagConfig.update({
        where,
        data: {
          ...config,
          fallthrough: json(config.fallthrough),
          rules: json(config.rules),
          version: { increment: 1 },
        },
      });
      await tx.auditEntry.create({
        data: {
          actor: 'admin',
          action: 'config.updated',
          flagId: target.id,
          environmentId: env.id,
          before: json(before),
          after: json(after),
        },
      });
      return after;
    });
  }
  async archive(slug: string, key: string) {
    const target = await this.detail(slug, key);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Flag" WHERE id = ${target.id} FOR UPDATE`;
      const before = await tx.flag.findUniqueOrThrow({
        where: { id: target.id },
      });
      if (before.archivedAt)
        throw new ApiError('FLAG_NOT_FOUND', 'Flag archived.', 404);
      const after = await tx.flag.update({
        where: { id: target.id },
        data: { archivedAt: new Date() },
      });
      await tx.auditEntry.create({
        data: {
          actor: 'admin',
          action: 'flag.archived',
          flagId: target.id,
          before: json(before),
          after: json(after),
        },
      });
      return { archived: true };
    });
  }
  async audit(slug: string, query: Record<string, unknown>) {
    const p = await this.project(slug);
    const q = z
      .object({
        flag: z.string().optional(),
        env: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(query);
    const where: Prisma.AuditEntryWhereInput = {
      flag: { projectId: p.id, ...(q.flag ? { key: q.flag } : {}) },
      ...(q.env ? { environment: { key: q.env } } : {}),
    };
    if (q.cursor) {
      const cursor = await db.auditEntry.findFirst({
        where: { ...where, id: q.cursor },
      });
      if (!cursor)
        throw new ApiError('INVALID_CURSOR', 'Audit cursor is invalid.');
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }
    const entries = await db.auditEntry.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: {
        flag: { select: { key: true } },
        environment: { select: { key: true } },
      },
    });
    return {
      entries: entries.slice(0, q.limit),
      nextCursor: entries.length > q.limit ? entries[q.limit - 1]?.id : null,
    };
  }
}
export type { Flag, Config };
