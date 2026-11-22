import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import BetterSqlite3 from 'better-sqlite3';
import { initializeDatabase } from './db';
import { createApp } from './app';
import { loadConfig, type AppConfig } from './config';
import { createRoom, createTransferRequest, getUserById, registerStudent } from './service';
import type { AuthUser } from '../src/shared/dormRules';

interface TestServer {
  base: string;
  db: ReturnType<typeof initializeDatabase>;
  dataDir: string;
  server: import('node:http').Server;
}

async function withServer(
  overrides: Partial<AppConfig>,
  fn: (ctx: TestServer) => Promise<void>
): Promise<void> {
  const db = initializeDatabase(':memory:', false);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'khabgah-http-test-'));
  const config: AppConfig = {
    ...loadConfig(process.cwd()),
    isDevelopment: false,
    host: '127.0.0.1',
    port: 0,
    dataDir,
    distDir: path.join(dataDir, 'dist'),
    backupIntervalHours: 0,
    ...overrides,
  };

  const app = await createApp(db, { config, enableStatic: false, logRequests: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;

  try {
    await fn({ base: `http://127.0.0.1:${port}`, db, dataDir, server });
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function login(base: string, username: string, password: string) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const setCookie = res.headers.getSetCookie?.()[0] ?? '';
  return {
    res,
    setCookie,
    cookie: setCookie.split(';')[0],
    body: (await res.json().catch(() => null)) as { user?: AuthUser; error?: string } | null,
  };
}

async function api(
  base: string,
  method: string,
  url: string,
  options: { cookie?: string; body?: unknown; origin?: string; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.origin) headers.origin = options.origin;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${url}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const setCookie = res.headers.getSetCookie?.()[0] ?? '';
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // پاسخ غیر JSON
  }
  return { res, json, text, setCookie, cookie: setCookie.split(';')[0] };
}

test('security headers, health, JSON 404 and unauthenticated denial', async () => {
  await withServer({}, async ({ base }) => {
    const health = await api(base, 'GET', '/api/health');
    assert.equal(health.res.status, 200);
    assert.equal(health.json.status, 'ok');

    const headers = await api(base, 'GET', '/api/auth/me');
    assert.equal(headers.res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(headers.res.headers.get('x-frame-options'), 'DENY');
    assert.equal(headers.res.headers.get('x-powered-by'), null);
    assert.match(headers.res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.match(headers.res.headers.get('referrer-policy') ?? '', /strict-origin/);

    const unknown = await api(base, 'GET', '/api/does-not-exist');
    assert.equal(unknown.res.status, 404);
    assert.match(unknown.res.headers.get('content-type') ?? '', /application\/json/);

    const dashboard = await api(base, 'GET', '/api/dashboard');
    assert.equal(dashboard.res.status, 401);

    const missingPage = await api(base, 'GET', '/somewhere');
    assert.equal(missingPage.res.status, 404);

    const badCookie = await api(base, 'GET', '/api/dashboard', {
      headers: { cookie: 'dorm_session=%E0%A4%A' },
    });
    assert.equal(badCookie.res.status, 401);
  });
});

test('login sets a hardened cookie, logout revokes the session, CSRF origin is enforced', async () => {
  await withServer({}, async ({ base }) => {
    const admin = await login(base, 'admin', 'Admin@1404');
    assert.equal(admin.res.status, 200);
    assert.match(admin.setCookie, /HttpOnly/i);
    assert.match(admin.setCookie, /SameSite=Lax/i);
    assert.match(admin.setCookie, /Path=\//i);

    const me = await api(base, 'GET', '/api/auth/me', { cookie: admin.cookie });
    assert.equal(me.json.user.username, 'admin');

    const evil = await api(base, 'POST', '/api/auth/logout', {
      cookie: admin.cookie,
      origin: 'https://evil.example',
    });
    assert.equal(evil.res.status, 403);

    const logout = await api(base, 'POST', '/api/auth/logout', {
      cookie: admin.cookie,
      origin: base,
    });
    assert.equal(logout.res.status, 200);

    // توکن پس از logout باید باطل شده باشد (نه فقط کوکی پاک شود)
    const after = await api(base, 'GET', '/api/dashboard', { cookie: admin.cookie });
    assert.equal(after.res.status, 401);
  });
});

test('repeated failed logins are throttled and audited', async () => {
  await withServer({ loginMaxAttemptsPerUser: 3, loginMaxAttemptsPerIp: 100 }, async ({ base, db }) => {
    let last = await login(base, 'sup_fanavari', 'wrong-1');
    for (let i = 2; i <= 3; i += 1) {
      last = await login(base, 'sup_fanavari', `wrong-${i}`);
      assert.equal(last.res.status, 401);
    }
    const blocked = await login(base, 'sup_fanavari', 'wrong-4');
    assert.equal(blocked.res.status, 429);
    assert.ok(Number(blocked.res.headers.get('retry-after')) > 0);

    // حتی رمز صحیح هم در بازه قفل پذیرفته نمی‌شود
    const correctWhileBlocked = await login(base, 'sup_fanavari', 'Fanavari@1404');
    assert.equal(correctWhileBlocked.res.status, 429);

    const failedAudit = db
      .prepare("SELECT COUNT(*) c FROM audit_logs WHERE action = 'ورود ناموفق به سامانه'")
      .get() as { c: number };
    assert.ok(failedAudit.c >= 3);
  });
});

test('parallel login attempts are capped (CPU exhaustion protection)', async () => {
  await withServer({ loginMaxAttemptsPerUser: 100, loginMaxAttemptsPerIp: 100 }, async ({ base }) => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => login(base, 'admin', `bad-${i}`))
    );
    const statuses = results.map((r) => r.res.status);
    assert.ok(statuses.some((s) => s === 429), `expected a 429, got ${statuses.join(',')}`);
  });
});

test('password change invalidates old sessions and issues a fresh one', async () => {
  await withServer({}, async ({ base }) => {
    const admin = await login(base, 'admin', 'Admin@1404');
    const changed = await api(base, 'POST', '/api/auth/change-password', {
      cookie: admin.cookie,
      origin: base,
      body: { currentPassword: 'Admin@1404', newPassword: 'NewStrongPass1' },
    });
    assert.equal(changed.res.status, 200);
    assert.ok(changed.cookie);

    const oldSession = await api(base, 'GET', '/api/dashboard', { cookie: admin.cookie });
    assert.equal(oldSession.res.status, 401);

    const newSession = await api(base, 'GET', '/api/dashboard', { cookie: changed.cookie });
    assert.equal(newSession.res.status, 200);

    // سیاست رمز عبور
    const weak = await api(base, 'POST', '/api/auth/change-password', {
      cookie: changed.cookie,
      body: { currentPassword: 'NewStrongPass1', newPassword: '123' },
    });
    assert.equal(weak.res.status, 400);
  });
});

test('deactivating a user revokes their live session', async () => {
  await withServer({}, async ({ base }) => {
    const admin = await login(base, 'admin', 'Admin@1404');
    const supervisor = await login(base, 'sup_maharat', 'Maharat@1404');
    assert.equal((await api(base, 'GET', '/api/dashboard', { cookie: supervisor.cookie })).res.status, 200);

    const deactivate = await api(base, 'PUT', '/api/users/3', {
      cookie: admin.cookie,
      origin: base,
      body: { isActive: false },
    });
    assert.equal(deactivate.res.status, 200);

    const after = await api(base, 'GET', '/api/dashboard', { cookie: supervisor.cookie });
    assert.equal(after.res.status, 401);
  });
});

test('boolean fields are strict and room deletion removes active residents', async () => {
  await withServer({}, async ({ base }) => {
    const admin = await login(base, 'admin', 'Admin@1404');
    const supervisor = await login(base, 'sup_fanavari', 'Fanavari@1404');
    const sup = supervisor.body!.user!;

    const room = await api(base, 'POST', '/api/rooms', {
      cookie: supervisor.cookie,
      origin: base,
      body: { roomNumber: 'HTTP-1', capacity: 2 },
    });
    assert.equal(room.res.status, 201);
    const roomId = room.json.room.id as number;

    const stringFalse = await api(base, 'PATCH', `/api/rooms/${roomId}/status`, {
      cookie: supervisor.cookie,
      origin: base,
      body: { isActive: 'false' },
    });
    assert.equal(stringFalse.res.status, 200);
    assert.equal(stringFalse.json.room.isActive, false);

    const invalidBoolean = await api(base, 'PATCH', `/api/rooms/${roomId}/status`, {
      cookie: supervisor.cookie,
      origin: base,
      body: { isActive: 'not-a-boolean' },
    });
    assert.equal(invalidBoolean.res.status, 400);

    const reactivate = await api(base, 'PATCH', `/api/rooms/${roomId}/status`, {
      cookie: supervisor.cookie,
      origin: base,
      body: { isActive: true },
    });
    assert.equal(reactivate.res.status, 200);
    assert.equal(reactivate.json.room.isActive, true);

    const student = await api(base, 'POST', '/api/students', {
      cookie: supervisor.cookie,
      origin: base,
      body: {
        firstName: 'تست',
        lastName: 'حذف',
        studentNumber: '49990001',
        mobile: '09150000001',
        roomId,
      },
    });
    assert.equal(student.res.status, 201);
    assert.equal(sup.dormId, 1);

    const supervisorDelete = await api(base, 'DELETE', `/api/rooms/${roomId}`, {
      cookie: supervisor.cookie,
      origin: base,
    });
    assert.equal(supervisorDelete.res.status, 403);

    const adminDeleteOccupied = await api(base, 'DELETE', `/api/rooms/${roomId}`, {
      cookie: admin.cookie,
      origin: base,
    });
    assert.equal(adminDeleteOccupied.res.status, 200);
    assert.equal(adminDeleteOccupied.json.deletedStudents, 1);

    const studentsAfterDelete = await api(base, 'GET', '/api/students', {
      cookie: admin.cookie,
    });
    assert.equal(studentsAfterDelete.res.status, 200);
    assert.equal(
      studentsAfterDelete.json.students.some(
        (s: { studentNumber: string }) => s.studentNumber === '49990001'
      ),
      false
    );
    const roomAfterDelete = await api(base, 'GET', `/api/rooms/${roomId}`, {
      cookie: admin.cookie,
    });
    assert.equal(roomAfterDelete.res.status, 404);
  });
});

test('student deletion endpoint is admin-only and frees the bed', async () => {
  await withServer({}, async ({ base }) => {
    const admin = await login(base, 'admin', 'Admin@1404');
    const supervisor = await login(base, 'sup_fanavari', 'Fanavari@1404');

    const roomRes = await api(base, 'POST', '/api/rooms', {
      cookie: supervisor.cookie,
      origin: base,
      body: { roomNumber: 'DEL-1', capacity: 2 },
    });
    assert.equal(roomRes.res.status, 201);
    const roomId = roomRes.json.room.id as number;

    const studentRes = await api(base, 'POST', '/api/students', {
      cookie: supervisor.cookie,
      origin: base,
      body: {
        firstName: 'حذف',
        lastName: 'دانشجو',
        studentNumber: '49990009',
        mobile: '09150000009',
        roomId,
      },
    });
    assert.equal(studentRes.res.status, 201);
    const studentId = studentRes.json.student.id as number;

    const supervisorDelete = await api(base, 'DELETE', `/api/students/${studentId}`, {
      cookie: supervisor.cookie,
    });
    assert.equal(supervisorDelete.res.status, 403);

    const adminDelete = await api(base, 'DELETE', `/api/students/${studentId}`, {
      cookie: admin.cookie,
    });
    assert.equal(adminDelete.res.status, 200);

    const detail = await api(base, 'GET', `/api/students/${studentId}`, {
      cookie: admin.cookie,
    });
    assert.equal(detail.res.status, 404);

    const room = await api(base, 'GET', `/api/rooms/${roomId}`, { cookie: admin.cookie });
    assert.equal(room.res.status, 200);
    assert.equal(room.json.room.remaining, 2);
  });
});

test('cross-dorm lookup is minimized and detail access is denied', async () => {
  await withServer({}, async ({ base, db }) => {
    const admin = getUserById(db, 1)!;
    const r1 = createRoom(db, admin, { dormId: 1, roomNumber: 'X-1', capacity: 2 });
    const r2 = createRoom(db, admin, { dormId: 2, roomNumber: 'X-2', capacity: 2 });
    const student = registerStudent(db, admin, {
      firstName: 'نیما',
      lastName: 'بهرامی',
      studentNumber: '40990001',
      nationalCode: '0012345678',
      mobile: '09159000001',
      guardianPhone: '09129000001',
      roomId: r1.id,
      dormId: 1,
    });
    createTransferRequest(db, admin, {
      studentId: student.id,
      toDormId: 2,
      toRoomId: r2.id,
      reason: 'انتقال آزمایشی بین خوابگاه‌ها',
      execute: true,
    });

    const supervisor = await login(base, 'sup_fanavari', 'Fanavari@1404');
    const lookup = await api(base, 'GET', '/api/students/lookup?studentNumber=40990001', {
      cookie: supervisor.cookie,
    });
    assert.equal(lookup.res.status, 200);
    assert.equal(lookup.json.exists, true);
    assert.equal(lookup.json.canEdit, false);
    assert.equal(lookup.json.inOtherDorm, true);
    assert.equal(lookup.json.student.mobile, undefined);
    assert.equal(lookup.json.student.nationalCode, undefined);
    assert.equal(lookup.json.student.currentRoomNumber, 'X-2');

    const detail = await api(base, 'GET', `/api/students/${student.id}`, {
      cookie: supervisor.cookie,
    });
    assert.equal(detail.res.status, 403);
  });
});

test('audit hash chain endpoint works and backups no longer contain the session secret', async () => {
  await withServer({}, async ({ base, dataDir }) => {
    const admin = await login(base, 'admin', 'Admin@1404');

    const integrity = await api(base, 'GET', '/api/audit-logs/integrity', {
      cookie: admin.cookie,
    });
    assert.equal(integrity.res.status, 200);
    assert.equal(integrity.json.ok, true);

    const backup = await api(base, 'POST', '/api/backups', {
      cookie: admin.cookie,
      origin: base,
      body: { notes: 'HTTP test backup' },
    });
    assert.equal(backup.res.status, 201);
    const backupId = backup.json.backup.id as number;

    const verify = await api(base, 'POST', `/api/backups/${backupId}/verify`, {
      cookie: admin.cookie,
      origin: base,
    });
    assert.equal(verify.res.status, 200);
    assert.equal(verify.json.ok, true);

    const download = await fetch(`${base}/api/backups/${backupId}/download`, {
      headers: { cookie: admin.cookie },
    });
    assert.equal(download.status, 200);
    const filePath = path.join(dataDir, 'downloaded-backup.db');
    fs.writeFileSync(filePath, Buffer.from(await download.arrayBuffer()));

    const backupDb = new BetterSqlite3(filePath, { readonly: true });
    try {
      const legacySecret = backupDb
        .prepare("SELECT value FROM system_settings WHERE key = '_internal_session_secret'")
        .get();
      assert.equal(legacySecret, undefined);
      const users = backupDb.prepare('SELECT COUNT(*) c FROM users').get() as { c: number };
      assert.ok(users.c >= 1);
    } finally {
      backupDb.close();
    }
  });
});

test('unknown body types produce 400/413 instead of 500', async () => {
  await withServer({}, async ({ base }) => {
    const admin = await login(base, 'admin', 'Admin@1404');

    const settings = await api(base, 'PUT', '/api/settings', {
      cookie: admin.cookie,
      body: { systemTitle: 123 },
    });
    assert.equal(settings.res.status, 400);

    const invalidFilter = await api(base, 'GET', '/api/students?dormId=abc', {
      cookie: admin.cookie,
    });
    assert.equal(invalidFilter.res.status, 400);

    const paged = await api(base, 'GET', '/api/audit-logs?page=1&pageSize=2', {
      cookie: admin.cookie,
    });
    assert.equal(paged.res.status, 200);
    assert.ok(Array.isArray(paged.json.logs));
    assert.ok(paged.json.logs.length <= 2);
    assert.ok(paged.json.total >= 1);

    const student = await api(base, 'POST', '/api/students', {
      cookie: admin.cookie,
      body: { firstName: ['x'], lastName: null, studentNumber: {}, mobile: 1, roomId: 1 },
    });
    assert.equal(student.res.status, 400);

    const huge = await fetch(`${base}/api/students`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ pad: 'x'.repeat(3 * 1024 * 1024) }),
    });
    assert.equal(huge.status, 413);
  });
});
