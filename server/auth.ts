import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import { getUserById } from './service';
import {
  createSessionRecord,
  findSessionByToken,
  pruneSessions,
  revokeSessionRecord,
  revokeSessionByToken,
  touchSessionIfStale,
} from './sessions';
import type { AuthUser } from '../src/shared/dormRules';

export const SESSION_COOKIE_NAME = 'dorm_session';
const SECRET_FILE_NAME = '.session-secret';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_IDLE_MS = 12 * 60 * 60 * 1000;

let sessionTtlMs = DEFAULT_TTL_MS;
let sessionIdleMs = DEFAULT_IDLE_MS;

/** تنظیم عمر مطلق و idle timeout نشست از کانفیگ برنامه. */
export function configureAuth(options: { sessionTtlMs?: number; sessionIdleMs?: number }): void {
  if (options.sessionTtlMs) sessionTtlMs = options.sessionTtlMs;
  if (options.sessionIdleMs) sessionIdleMs = options.sessionIdleMs;
}

const secretCache = new Map<string, string>();

function readSecretFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const value = fs.readFileSync(filePath, 'utf8').trim();
    return value.length >= 32 ? value : null;
  } catch {
    return null;
  }
}

function writeSecretFile(filePath: string, secret: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, secret, { mode: 0o600 });
  fs.renameSync(tmp, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // در ویندوز مجوز فایل معنای POSIX ندارد.
  }
}

/** حذف کلید قدیمی نشست از دیتابیس تا در بکاپ‌ها تکرار نشود. */
function removeLegacyDbSecret(db: Database.Database): boolean {
  const existing = db
    .prepare("SELECT value FROM system_settings WHERE key = '_internal_session_secret'")
    .get() as { value: string } | undefined;
  if (!existing) return false;
  db.prepare("DELETE FROM system_settings WHERE key = '_internal_session_secret'").run();
  db.prepare('DELETE FROM sessions').run();
  return true;
}

/**
 * کلید امضای نشست:
 *  ۱) SESSION_SECRET از محیط (اولویت اول)
 *  ۲) فایل `data/.session-secret` با مجوز ۶۰۰ (خارج از دیتابیس و بکاپ)
 *  ۳) تولید تصادفی امن + ذخیره در فایل
 * کلید قدیمی ذخیره‌شده در دیتابیس یک‌بار حذف و چرخش داده می‌شود.
 */
export function getSessionSecret(db: Database.Database): string {
  const cacheKey = db.name || ':memory:';
  const cached = secretCache.get(cacheKey);
  if (cached) return cached;

  if (removeLegacyDbSecret(db)) {
    console.warn(
      '[security] کلید نشست قدیمی از دیتابیس حذف شد؛ نشست‌ها باطل و کلید جدید ساخته می‌شود.'
    );
  }

  const envSecret = (process.env.SESSION_SECRET ?? '').trim();
  let secret: string;

  if (envSecret.length >= 32) {
    secret = envSecret;
  } else if (envSecret.length >= 16) {
    console.warn(
      '[security] SESSION_SECRET کوتاه است؛ برای امنیت کامل حداقل ۶۴ کاراکتر تصادفی توصیه می‌شود.'
    );
    secret = envSecret;
  } else if (db.name === ':memory:') {
    secret = crypto.randomBytes(32).toString('hex');
  } else {
    const filePath = path.join(path.dirname(db.name), SECRET_FILE_NAME);
    const fileSecret = readSecretFile(filePath);
    if (fileSecret) {
      secret = fileSecret;
    } else {
      secret = crypto.randomBytes(32).toString('hex');
      try {
        writeSecretFile(filePath, secret);
      } catch (err) {
        console.error('[security] ذخیره کلید نشست در فایل ممکن نشد؛ کلید موقت استفاده می‌شود.', err);
      }
    }
  }

  secretCache.set(cacheKey, secret);
  return secret;
}

/** فقط برای تست‌ها/ری‌استارت کامل: پاک‌کردن کش کلید. */
export function resetSessionSecretCache(): void {
  secretCache.clear();
}

interface SessionPayload {
  uid: number;
  sid: string;
  exp: number;
}

function encodePayload(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function signPayload(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge: number;
}

export function getSessionCookieOptions(secure: boolean): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: sessionTtlMs,
  };
}

/**
 * ساخت توکن نشست + ثبت رکورد قابل ابطال در دیتابیس.
 * توکن شامل شناسه نشست است؛ بنابراین حتی با نشت کلید، بدون رکورد دیتابیس معتبر نیست.
 */
export function signSessionToken(
  db: Database.Database,
  userId: number,
  options: { ip?: string | null; userAgent?: string | null; ttlMs?: number } = {}
): string {
  const secret = getSessionSecret(db);
  const ttlMs = options.ttlMs ?? sessionTtlMs;
  const exp = Date.now() + ttlMs;
  const payload = encodePayload({ uid: userId, sid: crypto.randomBytes(18).toString('base64url'), exp });
  const token = `${payload}.${signPayload(secret, payload)}`;

  createSessionRecord(db, {
    token,
    userId,
    expiresAt: exp,
    ipAddress: options.ip ?? '',
    userAgent: options.userAgent ?? '',
  });
  pruneSessions(db);
  return token;
}

export function verifySessionToken(db: Database.Database, token: string): number | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const secret = getSessionSecret(db);
  const expectedSig = signPayload(secret, payload);

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }

  if (
    !parsed ||
    !Number.isInteger(parsed.uid) ||
    parsed.uid <= 0 ||
    typeof parsed.sid !== 'string' ||
    parsed.sid.length < 10 ||
    !Number.isFinite(parsed.exp)
  ) {
    return null;
  }

  const now = Date.now();
  if (now > parsed.exp) return null;

  const session = findSessionByToken(db, token);
  if (!session) return null;
  if (session.user_id !== parsed.uid) return null;
  if (session.revoked_at !== null) return null;
  if (session.expires_at <= now) {
    revokeSessionRecord(db, session.id);
    return null;
  }
  if (now - session.last_seen_at > sessionIdleMs) {
    revokeSessionRecord(db, session.id);
    return null;
  }

  touchSessionIfStale(db, session.id, session.last_seen_at);
  return parsed.uid;
}

export function revokeToken(db: Database.Database, token: string): void {
  if (token) revokeSessionByToken(db, token);
}

export function getTokenFromRequest(req: Request): string {
  const cookies = parseCookieHeader(req.headers.cookie);
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : '';
  return cookies[SESSION_COOKIE_NAME] || bearer;
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(raw);
    } catch {
      // کوکی خراب نباید باعث خطای ۵۰۰ شود؛ نادیده گرفته می‌شود.
    }
  }
  return result;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
  sessionToken?: string;
}

export function requireAuth(db: Database.Database) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const token = getTokenFromRequest(req);
    const uid = verifySessionToken(db, token);
    if (!uid) {
      return res.status(401).json({ error: 'لطفاً ابتدا وارد سامانه شوید.' });
    }

    const user = getUserById(db, uid);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'نشست کاربری معتبر نیست یا حساب غیرفعال است.' });
    }

    req.user = user;
    req.sessionToken = token;
    next();
  };
}
