import type { Request, Response, NextFunction } from 'express';
import type { AppConfig } from './config';

/**
 * هدرهای امنیتی بدون وابستگی خارجی.
 * CSP در حالت توسعه برای سازگاری با Vite کمی بازتر است و در تولید سخت‌گیرانه اعمال می‌شود.
 */
export function securityHeaders(config: AppConfig) {
  const csp = config.isDevelopment
    ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss: http: https:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "media-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "upgrade-insecure-requests",
      ].join('; ');

  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()'
    );
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    const isHttps = req.secure || (config.trustProxy && req.headers['x-forwarded-proto'] === 'https');
    if (isHttps && !config.isDevelopment) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

/** لاگ سبک درخواست‌ها؛ کوئری‌ها لاگ نمی‌شوند تا داده حساس در لاگ ننشیند. */
export function requestLogger(enabled = true) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!enabled) return next();
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      console.log(
        `[http] ${req.method} ${req.path} ${res.statusCode} ${durationMs.toFixed(1)}ms ip=${req.ip ?? '-'}`
      );
    });
    next();
  };
}

/** تشخیص HTTPS با احترام به Trust Proxy فقط در صورت فعال بودن صریح. */
export function isRequestSecure(req: Request, config: AppConfig): boolean {
  if (req.secure) return true;
  return config.trustProxy && req.headers['x-forwarded-proto'] === 'https';
}

/** جلوگیری از CSRF: درخواست‌های تغییردهنده با Origin بیگانه رد می‌شوند. */
export function csrfOriginGuard(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const origin = req.headers.origin;
  if (!origin) return next();

  try {
    const originHost = new URL(origin).host;
    if (!originHost || originHost !== req.headers.host) {
      res.status(403).json({ error: 'درخواست از منبع نامعتبر رد شد.' });
      return;
    }
  } catch {
    res.status(403).json({ error: 'درخواست از منبع نامعتبر رد شد.' });
    return;
  }
  next();
}

/** تبدیل خطای بدنه JSON به پاسخ JSON استاندارد. */
export function bodyParserErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  const anyErr = err as { type?: string; status?: number; message?: string };
  if (anyErr?.type === 'entity.too.large') {
    res.status(413).json({ error: 'حجم داده ارسالی بیش از حد مجاز است.' });
    return;
  }
  if (anyErr?.type === 'entity.parse.failed' || (anyErr?.status === 400 && anyErr?.message)) {
    res.status(400).json({ error: 'قالب داده ارسالی معتبر نیست.' });
    return;
  }
  next(err);
}

/** محدودکننده تلاش‌ها (درون‌حافظه‌ای، مناسب استقرار تک‌نمونه‌ای). */
export class AttemptLimiter {
  private entries = new Map<string, { count: number; firstAt: number; blockedUntil: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly maxAttempts: number,
    private readonly blockMs: number
  ) {}

  /** ثانیه‌های باقی‌مانده تا رفع قفل؛ صفر یعنی مجاز. */
  retryAfterSeconds(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    const now = Date.now();
    if (entry.blockedUntil > now) return Math.ceil((entry.blockedUntil - now) / 1000);
    if (now - entry.firstAt > this.windowMs) {
      this.entries.delete(key);
      return 0;
    }
    return 0;
  }

  fail(key: string): void {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry || now - entry.firstAt > this.windowMs) {
      this.entries.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
      this.prune(now);
      return;
    }
    entry.count += 1;
    if (entry.count >= this.maxAttempts) {
      entry.blockedUntil = now + this.blockMs;
      entry.count = 0;
      entry.firstAt = now;
    }
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private prune(now: number): void {
    if (this.entries.size < 2000) return;
    for (const [key, entry] of this.entries) {
      if (entry.blockedUntil < now && now - entry.firstAt > this.windowMs) {
        this.entries.delete(key);
      }
    }
  }
}

/** محدودکننده هم‌زمانی عملیات سنگین رمزنگاری برای جلوگیری از اشباع CPU. */
export function createConcurrencyGuard(maxConcurrent: number) {
  let inFlight = 0;
  return {
    tryAcquire(): boolean {
      if (inFlight >= maxConcurrent) return false;
      inFlight += 1;
      return true;
    },
    release(): void {
      inFlight = Math.max(0, inFlight - 1);
    },
  };
}
