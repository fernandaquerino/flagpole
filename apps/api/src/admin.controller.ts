import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Query,
  UseGuards,
  Inject,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AdminGuard, assertOrigin, login } from './auth.js';
import { FlagsService } from './flags.service.js';
@Controller('api/auth')
export class AuthController {
  @Post('login') login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertOrigin(req);
    return login(
      z.object({ password: z.string().min(1).max(1000) }).parse(body).password,
      res,
    );
  }
  @Post('logout') @UseGuards(AdminGuard) logout(
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie('flagpole_session', { path: '/' });
    return { ok: true };
  }
  @Get('session') @UseGuards(AdminGuard) session() {
    return { actor: 'admin' };
  }
}
@Controller('api/projects')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(@Inject(FlagsService) private readonly flags: FlagsService) {}
  @Get() projects() {
    return this.flags.projects();
  }
  @Get(':slug/flags') list(@Param('slug') slug: string) {
    return this.flags.list(slug);
  }
  @Post(':slug/flags') create(
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    return this.flags.create(slug, body);
  }
  @Get(':slug/flags/:key') detail(
    @Param('slug') slug: string,
    @Param('key') key: string,
  ) {
    return this.flags.detail(slug, key);
  }
  @Patch(':slug/flags/:key') edit(
    @Param('slug') slug: string,
    @Param('key') key: string,
    @Body() body: unknown,
  ) {
    return this.flags.edit(slug, key, body);
  }
  @Put(':slug/flags/:key/environments/:env') replace(
    @Param('slug') slug: string,
    @Param('key') key: string,
    @Param('env') env: string,
    @Body() body: unknown,
  ) {
    return this.flags.replace(slug, key, env, body);
  }
  @Post(':slug/flags/:key/archive') archive(
    @Param('slug') slug: string,
    @Param('key') key: string,
  ) {
    return this.flags.archive(slug, key);
  }
  @Get(':slug/audit') audit(
    @Param('slug') slug: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.flags.audit(slug, query);
  }
}
