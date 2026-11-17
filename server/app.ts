import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { configureAuth } from './auth';
import type { AppConfig } from './config';
import { ServiceError } from './errors';
import { createApiRouter } from './routes';
import {
  bodyParserErrorHandler,
  csrfOriginGuard,
  requestLogger,
  securityHeaders,
} from './security';

export interface CreateAppOptions {
  config: AppConfig;
  /** در تست‌ها خاموش می‌شود تا نیازی به dist نباشد. */
  enableStatic?: boolean;
  logRequests?: boolean;
}

export async function createApp(
  db: Database.Database,
  options: CreateAppOptions
): Promise<express.Express> {
  const { config } = options;
  configureAuth(config);

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(securityHeaders(config));
  app.use(requestLogger(options.logRequests ?? true));
  app.use(express.json({ limit: '2mb' }));
  app.use(csrfOriginGuard);
  app.use(bodyParserErrorHandler);

  if (config.forceHttps && !config.isDevelopment) {
    app.use((req, res, next) => {
      if (req.secure) return next();
      res.redirect(308, `https://${req.headers.host ?? ''}${req.originalUrl}`);
    });
  }

  app.use('/api', createApiRouter(db, config.dataDir, config));

  if (config.isDevelopment) {
    // حتی در حالت توسعه، داده و فایل‌های حساس پروژه سرو نمی‌شوند.
    const blockedDevPaths =
      /^\/(?:\.|data(?:\/|$)|server(?:\.ts|\/|$)|scripts(?:\/|$)|package(?:-lock)?\.json$|tsconfig\.json$|vite\.config\.ts$)/;
    app.use((req, res, next) => {
      if (blockedDevPaths.test(req.path)) {
        return res.status(404).json({ error: 'مسیر یافت نشد.' });
      }
      next();
    });

    // Vite فقط در حالت توسعه صریح بارگذاری می‌شود؛ در تولید هرگز فایل پروژه سرو نمی‌شود.
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (options.enableStatic ?? true) {
    const distDir = config.distDir;
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      console.warn('[server] dist/index.html یافت نشد؛ ابتدا «npm run build» را اجرا کنید.');
    }
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      // درخواست فایل‌های ناموجود نباید با index.html پاسخ داده شود.
      if (path.extname(req.path)) return next();
      res.sendFile(path.join(distDir, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
    app.use((_req, res) => {
      res.status(404).json({ error: 'مسیر یافت نشد.' });
    });
  } else {
    app.use((_req, res) => {
      res.status(404).json({ error: 'مسیر یافت نشد.' });
    });
  }

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Unexpected server error:', err);
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: 'خطای داخلی سرور رخ داد. لطفاً مجدداً تلاش کنید.' });
    }
    return res.status(500).send('خطای داخلی سرور');
  });

  return app;
}
