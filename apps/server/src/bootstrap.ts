import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app';
import { validateEnvironment } from './config';

@Catch()
class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request & { requestId?: string }>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    res.status(status).json({
      error: {
        code: 'HTTP_' + status,
        message: status === 500 ? '服务暂时不可用，请重试' : (error as Error).message,
      },
      requestId: req.requestId,
    });
  }
}
export async function createApp() {
  validateEnvironment();
  const app = await NestFactory.create(AppModule.register(), {
    logger: process.env.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'],
  });
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request & { requestId?: string }, res: Response, next: NextFunction) => {
    req.requestId = randomUUID();
    res.setHeader('x-request-id', req.requestId);
    res.setHeader('cache-control', 'no-store');
    const origin = req.header('origin');
    const allowed = [
      process.env.APP_ORIGIN || 'http://localhost:5173',
      process.env.ADMIN_ORIGIN || 'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ];
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && !allowed.includes(origin)) {
      res.status(403).json({
        error: { code: 'ORIGIN_DENIED', message: '不允许的请求来源' },
        requestId: req.requestId,
      });
      return;
    }
    next();
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  await app.init();
  return app;
}
