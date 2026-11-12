import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  Req,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Environment } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  configSchema,
  contextSchema,
  flagSchema,
  type Context,
} from '@flagpole/shared';
import { evaluate } from '@flagpole/evaluator';
import { db } from './database.js';
import { hashKey } from './keys.js';
import { ApiError } from './errors.js';
export async function sdkAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.vary('Origin');
    res.setHeader('Cache-Control', 'private, no-cache');
    const origin = req.headers.origin;
    if (req.method === 'OPTIONS') {
      if (
        !origin ||
        !(await db.environment.findFirst({
          where: { allowedOrigins: { has: origin } },
        }))
      )
        throw new ApiError('ORIGIN_DENIED', 'Origin is not allowed.', 403);
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, If-None-Match',
      );
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.status(204).end();
      return;
    }
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    const isServer = req.path === '/v1/flags';
    if (!token)
      throw new ApiError(
        'SDK_KEY_INVALID',
        'A valid SDK key is required.',
        401,
      );
    const environment = await db.environment.findFirst({
      where: isServer
        ? { serverSdkKeyHash: hashKey(token) }
        : { clientSdkKeyHash: hashKey(token) },
    });
    if (!environment)
      throw new ApiError(
        'SDK_KEY_INVALID',
        'A valid SDK key is required.',
        401,
      );
    if (origin && !environment.allowedOrigins.includes(origin))
      throw new ApiError(
        'ORIGIN_DENIED',
        'Origin is not allowed for this environment.',
        403,
      );
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Expose-Headers', 'ETag');
    res.locals.environment = environment;
    next();
  } catch (error) {
    if (error instanceof ApiError)
      res.status(error.getStatus()).json(error.getResponse());
    else
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed.',
      });
  }
}
@Injectable()
export class SdkService {
  async definitions(env: Environment) {
    const flags = await db.flag.findMany({
      where: { projectId: env.projectId, archivedAt: null },
      include: { configs: { where: { environmentId: env.id } } },
      orderBy: { key: 'asc' },
    });
    return flags.map((f) => ({
      flag: flagSchema.parse({ ...f, archivedAt: null }),
      config: f.configs[0] ? configSchema.parse(f.configs[0]) : undefined,
    }));
  }
  async evaluate(env: Environment, context: Context) {
    return {
      flags: Object.fromEntries(
        (await this.definitions(env)).map((d) => [
          d.flag.key,
          evaluate(d.flag, d.config, context),
        ]),
      ),
    };
  }
}
@Controller('sdk/v1')
export class SdkController {
  constructor(@Inject(SdkService) private readonly sdk: SdkService) {}
  @Post('evaluate') async evaluate(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const { context } = z
      .object({ context: contextSchema })
      .strict()
      .parse(body);
    return this.sdk.evaluate(res.locals.environment as Environment, context);
  }
  @Get('flags') async flags(@Req() req: Request, @Res() res: Response) {
    const body = {
      flags: await this.sdk.definitions(res.locals.environment as Environment),
    };
    const etag = `"${createHash('sha256').update(JSON.stringify(body)).digest('hex')}"`;
    res.setHeader('ETag', etag);
    if (
      req.headers['if-none-match']
        ?.split(',')
        .map((v) => v.trim())
        .includes(etag)
    ) {
      res.status(304).end();
      return;
    }
    res.json(body);
  }
}
