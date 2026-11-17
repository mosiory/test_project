import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface CreateSessionInput {
  token: string;
  userId: number;
  expiresAt: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function createSessionRecord(db: Database.Database, input: CreateSessionInput): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    hashToken(input.token),
    input.userId,
    now,
    now,
    input.expiresAt,
    (input.ipAddress ?? '').slice(0, 64),
    (input.userAgent ?? '').slice(0, 300)
  );
}

export interface SessionRow {
  id: number;
  user_id: number;
  last_seen_at: number;
  expires_at: number;
  revoked_at: number | null;
}

export function findSessionByToken(db: Database.Database, token: string): SessionRow | undefined {
  return db
    .prepare(
      `SELECT id, user_id, last_seen_at, expires_at, revoked_at
       FROM sessions WHERE token_hash = ?`
    )
    .get(hashToken(token)) as SessionRow | undefined;
}

export function touchSessionIfStale(
  db: Database.Database,
  sessionId: number,
  lastSeenAt: number,
  minIntervalMs = 5 * 60 * 1000
): void {
  const now = Date.now();
  if (now - lastSeenAt < minIntervalMs) return;
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now, sessionId);
}

export function revokeSessionRecord(db: Database.Database, sessionId: number): void {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(
    Date.now(),
    sessionId
  );
}

export function revokeSessionByToken(db: Database.Database, token: string): void {
  const session = findSessionByToken(db, token);
  if (session) revokeSessionRecord(db, session.id);
}

/** ابطال همهٔ نشست‌های یک کاربر؛ در تغییر رمز یا غیرفعال‌سازی حساب استفاده می‌شود. */
export function revokeUserSessions(
  db: Database.Database,
  userId: number,
  exceptSessionId?: number
): number {
  const now = Date.now();
  const result = exceptSessionId
    ? db
        .prepare(
          'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?'
        )
        .run(now, userId, exceptSessionId)
    : db
        .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
        .run(now, userId);
  return result.changes;
}

/** پاک‌سازی دوره‌ای نشست‌های منقضی/باطل‌شده. */
export function pruneSessions(db: Database.Database): void {
  const now = Date.now();
  db.prepare(
    `DELETE FROM sessions
     WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`
  ).run(now, now - 30 * 24 * 60 * 60 * 1000);
}
