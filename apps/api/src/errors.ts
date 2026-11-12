import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { Response } from 'express';
export class ApiError extends HttpException {
  constructor(code: string, message: string, status = 400) {
    super({ code, message }, status);
  }
}
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof ZodError) {
      const weights = error.issues.some(
        (i) => i.message === 'INVALID_ROLLOUT_WEIGHTS',
      );
      res.status(400).json({
        code: weights ? 'INVALID_ROLLOUT_WEIGHTS' : 'INVALID_REQUEST',
        message: weights
          ? 'Rollout weights must sum to 10000.'
          : error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; '),
      });
      return;
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      res.status(409).json({
        code: 'FLAG_KEY_TAKEN',
        message: 'That key is already in use.',
      });
      return;
    }
    if (error instanceof HttpException) {
      const body = error.getResponse();
      res
        .status(error.getStatus())
        .json(
          typeof body === 'object' && 'code' in body
            ? body
            : { code: 'REQUEST_FAILED', message: error.message },
        );
      return;
    }
    // Never log request bodies or evaluation contexts.
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed.',
    });
  }
}
