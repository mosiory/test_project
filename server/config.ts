import path from 'node:path';

export interface AppConfig {
  port: number;
  host: string;
  /** حالت توسعه صرفاً با NODE_ENV=development فعال می‌شود. */
  isDevelopment: boolean;
  trustProxy: boolean;
  forceHttps: boolean;
  dataDir: string;
  distDir: string;
  /** اختلاف منطقه زمانی محلی با UTC برای فیلترهای تاریخی (پیش‌فرض تهران: +۲۱۰ دقیقه) */
  tzOffsetMinutes: number;
  sessionTtlMs: number;
  sessionIdleMs: number;
  backupIntervalHours: number;
  backupRetentionDays: number;
  /** حداکثر تلاش ورود ناموفق پیش از قفل موقت */
  loginMaxAttemptsPerIp: number;
  loginMaxAttemptsPerUser: number;
  loginWindowMs: number;
  loginBlockMs: number;
}

function intEnv(name: string, fallback: number, min = Number.MIN_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min) return fallback;
  return value;
}

function boolEnv(name: string, fallback = false): boolean {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (raw === '') return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function loadConfig(cwd = process.cwd()): AppConfig {
  return {
    port: intEnv('PORT', 4780, 1),
    host: (process.env.HOST ?? '127.0.0.1').trim() || '127.0.0.1',
    isDevelopment: process.env.NODE_ENV === 'development',
    trustProxy: boolEnv('TRUST_PROXY'),
    forceHttps: boolEnv('FORCE_HTTPS'),
    dataDir: path.resolve(cwd, 'data'),
    distDir: path.resolve(cwd, 'dist'),
    tzOffsetMinutes: intEnv('APP_TZ_OFFSET_MINUTES', 210),
    sessionTtlMs: intEnv('SESSION_TTL_HOURS', 24 * 7, 1) * 60 * 60 * 1000,
    sessionIdleMs: intEnv('SESSION_IDLE_HOURS', 12, 1) * 60 * 60 * 1000,
    backupIntervalHours: intEnv('BACKUP_INTERVAL_HOURS', 24, 0),
    backupRetentionDays: intEnv('BACKUP_RETENTION_DAYS', 30, 1),
    loginMaxAttemptsPerIp: intEnv('LOGIN_MAX_ATTEMPTS_PER_IP', 20, 3),
    loginMaxAttemptsPerUser: intEnv('LOGIN_MAX_ATTEMPTS_PER_USER', 8, 3),
    loginWindowMs: intEnv('LOGIN_WINDOW_MINUTES', 10, 1) * 60 * 1000,
    loginBlockMs: intEnv('LOGIN_BLOCK_MINUTES', 15, 1) * 60 * 1000,
  };
}
