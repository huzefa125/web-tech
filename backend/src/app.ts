/** Express application. Exported separately from the server so tests can
 *  mount it with supertest without binding a port. */

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env, isProduction, isTest } from './config/env.js';
import { errorHandler, notFoundHandler } from './http/middleware/error-handler.js';
import { authRouter } from './http/routes/auth.js';
import { logger } from './lib/logger.js';

export function createApp(): Express {
  const app = express();

  // Behind Railway/Render/Vercel there is exactly one proxy hop. Setting a
  // number rather than `true` stops a client from spoofing X-Forwarded-For
  // and evading IP rate limits.
  app.set('trust proxy', isProduction ? 1 : false);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; a restrictive CSP here is meaningless but
      // HSTS is not.
      contentSecurityPolicy: false,
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(
    cors({
      // Explicit allowlist, never '*' — credentials: true forbids wildcards
      // anyway, and silently broken CORS is worse than a loud rejection.
      origin: env.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86_400,
    }),
  );

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        // Health checks would otherwise dominate the logs.
        autoLogging: { ignore: (req) => req.url === '/health' },
      }),
    );
  }

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use(`${env.API_V1_PREFIX}/auth`, authRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
