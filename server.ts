import 'dotenv/config';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type Database from 'better-sqlite3';
import { initializeDatabase } from './server/db';
import { createApp } from './server/app';
import { loadConfig } from './server/config';
import { getSessionSecret } from './server/auth';
import { startBackupScheduler } from './server/service';

/** هشدار (نه تغییر) در صورت فعال بودن رمزهای پیش‌فرض مستندشده. */
function warnAboutDefaultPasswords(db: Database.Database) {
  const defaults: Array<[string, string]> = [
    ['admin', 'Admin@1404'],
    ['sup_fanavari', 'Fanavari@1404'],
    ['sup_maharat', 'Maharat@1404'],
  ];
  const rows = db.prepare('SELECT username, password_hash FROM users').all() as Array<{
    username: string;
    password_hash: string;
  }>;
  for (const row of rows) {
    const match = defaults.find(
      ([username, password]) =>
        username === row.username && bcrypt.compareSync(password, row.password_hash)
    );
    if (match) {
      console.warn(
        `[security] رمز عبور پیش‌فرض حساب «${row.username}» هنوز فعال است. لطفاً فوراً آن را تغییر دهید.`
      );
    }
  }
}

async function startServer() {
  const config = loadConfig();
  const dbPath = path.join(config.dataDir, 'dormitory.db');
  const backupDir = path.join(config.dataDir, 'backups');

  if (config.isDevelopment) {
    console.log('[server] حالت توسعه فعال است (NODE_ENV=development).');
  }

  const db = initializeDatabase(dbPath, true);

  if (!process.env.SESSION_SECRET) {
    console.warn(
      '[security] SESSION_SECRET تنظیم نشده است؛ از کلید فایل data/.session-secret استفاده می‌شود.'
    );
  }
  warnAboutDefaultPasswords(db);
  // مهاجرت/چرخش کلید قدیمی ذخیره‌شده در دیتابیس در همین مرحله انجام می‌شود.
  getSessionSecret(db);

  const app = await createApp(db, { config });
  const server = app.listen(config.port, config.host, () => {
    console.log(
      `Dormitory Management Server listening on http://${config.host}:${config.port} (${config.isDevelopment ? 'development' : 'production'})`
    );
  });

  const stopBackupScheduler = startBackupScheduler(
    db,
    backupDir,
    config.backupIntervalHours,
    config.backupRetentionDays
  );

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] دریافت ${signal}؛ خاموشی تمیز آغاز شد.`);
    stopBackupScheduler();
    server.close(() => {
      try {
        db.close();
      } catch {
        // نادیده گرفتن خطای بستن دیتابیس
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
