import 'reflect-metadata';
import { Module, Controller, Get } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
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
  controllers: [HealthController, AdminController, AuthController],
  providers: [FlagsService, AdminGuard],
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
  app.use(express.json({ limit: '64kb' }));
  app.useGlobalFilters(new ErrorFilter());
  app.enableCors({
    origin: process.env.ADMIN_ORIGIN,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-Flagpole-CSRF'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'],
  });
  await app.init();
  return app;
}
