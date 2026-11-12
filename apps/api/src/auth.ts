import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiError } from './errors.js';
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password: string): boolean {
  const [scheme, salt, encoded] =
    process.env.ADMIN_PASSWORD_HASH?.split(':') ?? [];
  if (scheme !== 'scrypt' || !salt || !encoded) return false;
  const expected = Buffer.from(encoded, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function signature(payload: string) {
  return createHmac('sha256', process.env.SESSION_SECRET!)
    .update(payload)
    .digest('hex');
}
export function assertOrigin(req: Request) {
  if (req.headers.origin && req.headers.origin !== process.env.ADMIN_ORIGIN)
    throw new ApiError('ORIGIN_DENIED', 'Origin is not allowed.', 403);
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    req.headers['x-flagpole-csrf'] !== '1'
  )
    throw new ApiError('CSRF_INVALID', 'Missing CSRF header.', 403);
}
export function login(password: string, res: Response) {
  if (!verifyPassword(password))
    throw new ApiError('AUTH_INVALID', 'Invalid password.', 401);
  const payload = `${Date.now() + 8 * 60 * 60 * 1000}.${randomBytes(16).toString('hex')}`;
  res.cookie('flagpole_session', `${payload}.${signature(payload)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
  return { actor: 'admin' };
}
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    assertOrigin(req);
    const raw = req.headers.cookie
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('flagpole_session='))
      ?.slice(17);
    const [expiry, nonce, sig] = raw?.split('.') ?? [];
    if (
      !expiry ||
      !nonce ||
      !sig ||
      Number(expiry) < Date.now() ||
      !Number.isFinite(Number(expiry))
    )
      throw new ApiError('AUTH_REQUIRED', 'Sign in to continue.', 401);
    const expected = Buffer.from(signature(`${expiry}.${nonce}`));
    const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new ApiError('AUTH_REQUIRED', 'Sign in to continue.', 401);
    return true;
  }
}
