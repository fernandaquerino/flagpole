import 'reflect-metadata';
import { Module, Controller, Get } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { sdkAccess, SdkController, SdkService } from './sdk.js';
import { AdminController, AuthController } from './admin.controller.js';
import { AdminGuard } from './auth.js';
import { FlagsService } from './flags.service.js';
import { ErrorFilter } from './errors.js';
@Controller()
class HealthController {
  @Get('health') health() {
    return { status: 'ok' };
  }
}
@Module({
  controllers: [
    HealthController,
    AdminController,
    AuthController,
    SdkController,
  ],
  providers: [FlagsService, AdminGuard, SdkService],
})
class AppModule {}
export async function createApp() {
  if (
    !process.env.ADMIN_PASSWORD_HASH?.startsWith('scrypt:') ||
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32 ||
    !process.env.ADMIN_ORIGIN
  )
    throw new Error(
      'Configure ADMIN_PASSWORD_HASH, SESSION_SECRET (32+ chars), and ADMIN_ORIGIN.',
    );
  const app = await NestFactory.create(AppModule, {
    logger: false,
    bodyParser: false,
  });
  app.use('/sdk', sdkAccess);
  app.use(express.json({ limit: '64kb' }));
  app.useGlobalFilters(new ErrorFilter());
  app.use(
    '/api',
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      res.vary('Origin');
      res.setHeader('Cache-Control', 'no-store');
      if (req.headers.origin === process.env.ADMIN_ORIGIN) {
        res.setHeader('Access-Control-Allow-Origin', process.env.ADMIN_ORIGIN!);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, X-Flagpole-CSRF',
        );
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET, POST, PATCH, PUT, OPTIONS',
        );
      }
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
    },
  );
  await app.init();
  return app;
}
