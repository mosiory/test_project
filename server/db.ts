import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { getCurrentShamsiYear } from '../src/shared/dormRules';

export interface DormDatabase {
  sqlite: Database.Database;
  dbPath: string;
}

export function initializeDatabase(dbPath: string, seedDemoData = true): Database.Database {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS dormitories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'supervisor')),
      dorm_id INTEGER REFERENCES dormitories(id) ON DELETE RESTRICT,
      photo_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dorm_id INTEGER NOT NULL REFERENCES dormitories(id) ON DELETE RESTRICT,
      room_number TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity > 0),
      extra_capacity INTEGER NOT NULL DEFAULT 0,
      floor TEXT NOT NULL DEFAULT 'همکف',
      notes TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(dorm_id, room_number)
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      national_code TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      entry_term TEXT,
      semester INTEGER,
      degree TEXT,
      major TEXT NOT NULL DEFAULT '',
      mobile TEXT NOT NULL,
      guardian_phone TEXT NOT NULL DEFAULT '',
      photo_url TEXT,
      attendance_type TEXT,
      status TEXT NOT NULL DEFAULT 'ساکن' CHECK(
        status IN ('ساکن', 'انصراف از خوابگاه', 'فارغ‌التحصیل', 'اخراج‌شده', 'انتقال‌یافته')
      ),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_residences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      dorm_id INTEGER NOT NULL REFERENCES dormitories(id) ON DELETE RESTRICT,
      room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
      start_date TEXT NOT NULL DEFAULT (datetime('now')),
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      is_extra_capacity INTEGER NOT NULL DEFAULT 0 CHECK(is_extra_capacity IN (0, 1)),
      exit_reason TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_residence
      ON student_residences(student_id)
      WHERE is_active = 1;

    CREATE INDEX IF NOT EXISTS idx_residences_room_active
      ON student_residences(room_id, is_active);

    CREATE INDEX IF NOT EXISTS idx_residences_dorm_active
      ON student_residences(dorm_id, is_active);

    CREATE INDEX IF NOT EXISTS idx_students_name
      ON students(last_name, first_name);

    CREATE INDEX IF NOT EXISTS idx_students_status
      ON students(status);

    CREATE TABLE IF NOT EXISTS room_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      from_dorm_id INTEGER REFERENCES dormitories(id) ON DELETE RESTRICT,
      from_room_id INTEGER REFERENCES rooms(id) ON DELETE RESTRICT,
      to_dorm_id INTEGER NOT NULL REFERENCES dormitories(id) ON DELETE RESTRICT,
      to_room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('initial', 'internal', 'transfer')),
      reason TEXT NOT NULL DEFAULT '',
      performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      moved_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transfer_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      from_dorm_id INTEGER NOT NULL REFERENCES dormitories(id) ON DELETE RESTRICT,
      from_room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
      to_dorm_id INTEGER NOT NULL REFERENCES dormitories(id) ON DELETE RESTRICT,
      to_room_id INTEGER REFERENCES rooms(id) ON DELETE RESTRICT,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'در انتظار تأیید' CHECK(
        status IN ('در انتظار تأیید', 'تأییدشده', 'ردشده', 'لغوشده')
      ),
      rejection_reason TEXT,
      requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name TEXT NOT NULL,
      dorm_id INTEGER REFERENCES dormitories(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backup_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user
      ON sessions(user_id, revoked_at);

    CREATE INDEX IF NOT EXISTS idx_sessions_expires
      ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_dorm_created
      ON audit_logs(dorm_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_audit_created
      ON audit_logs(created_at);

    CREATE INDEX IF NOT EXISTS idx_movements_to_dorm
      ON room_movements(to_dorm_id, moved_at);

    CREATE INDEX IF NOT EXISTS idx_movements_student
      ON room_movements(student_id);

    CREATE INDEX IF NOT EXISTS idx_transfers_student
      ON transfer_requests(student_id, status);

    CREATE INDEX IF NOT EXISTS idx_residences_student
      ON student_residences(student_id);
  `);

  migrateSchema(db);
  ensureSchemaColumns(db);
  markSchemaMigrations(db);

  const dormCount = (db.prepare('SELECT COUNT(*) as c FROM dormitories').get() as { c: number }).c;
  if (dormCount === 0 && seedDemoData) {
    seedInitialData(db);
  } else if (dormCount === 0) {
    seedMinimalStructure(db);
  }

  return db;
}

function tableColumns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
}

/**
 * مهاجرت اسکیمای پایگاه داده برای نصب‌های قدیمی‌تر:
 *  - فیلدهای تحصیلی دانشجو (شهر/ورودی/ترم/مقطع/رشته) اختیاری می‌شوند.
 *  - اتاق مقصد درخواست انتقال می‌تواند خالی بماند تا مسئول کل آن را تعیین کند.
 * تمام ستون‌های موجود (از جمله کد ملی/شماره ولی/تصویر) حفظ می‌شوند.
 */
function migrateSchema(db: Database.Database) {
  const tableSql = (name: string) =>
    (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(name) as
      | { sql: string }
      | undefined)?.sql ?? '';

  const studentsSql = tableSql('students');
  if (
    studentsSql &&
    (/entry_term TEXT NOT NULL/.test(studentsSql) ||
      /semester INTEGER NOT NULL/.test(studentsSql) ||
      /degree TEXT NOT NULL/.test(studentsSql))
  ) {
    const oldCols = tableColumns(db, 'students');
    const pick = (column: string, fallback: string) =>
      oldCols.includes(column) ? `"${column}"` : fallback;
    const migratedColumns = [
      'id',
      'student_number',
      'first_name',
      'last_name',
      'city',
      'entry_term',
      'semester',
      'degree',
      'major',
      'mobile',
      'national_code',
      'guardian_phone',
      'photo_url',
      'attendance_type',
      'status',
      'created_at',
      'updated_at',
    ];
    const selectExpressions = [
      pick('id', 'NULL'),
      pick('student_number', "''"),
      pick('first_name', "''"),
      pick('last_name', "''"),
      pick('city', "''"),
      pick('entry_term', 'NULL'),
      pick('semester', 'NULL'),
      pick('degree', 'NULL'),
      pick('major', "''"),
      pick('mobile', "''"),
      pick('national_code', "''"),
      pick('guardian_phone', "''"),
      pick('photo_url', 'NULL'),
      pick('attendance_type', 'NULL'),
      pick('status', "'ساکن'"),
      pick('created_at', "datetime('now')"),
      pick('updated_at', "datetime('now')"),
    ];

    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(`
        DROP TABLE IF EXISTS students_migrated;
        CREATE TABLE students_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_number TEXT NOT NULL UNIQUE,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          national_code TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT '',
          entry_term TEXT,
          semester INTEGER,
          degree TEXT,
          major TEXT NOT NULL DEFAULT '',
          mobile TEXT NOT NULL,
          guardian_phone TEXT NOT NULL DEFAULT '',
          photo_url TEXT,
          attendance_type TEXT,
          status TEXT NOT NULL DEFAULT 'ساکن' CHECK(
            status IN ('ساکن', 'انصراف از خوابگاه', 'فارغ‌التحصیل', 'اخراج‌شده', 'انتقال‌یافته')
          ),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO students_migrated (${migratedColumns.join(', ')})
        SELECT ${selectExpressions.join(', ')}
        FROM students;

        DROP TABLE students;
        ALTER TABLE students_migrated RENAME TO students;

        CREATE INDEX IF NOT EXISTS idx_students_name ON students(last_name, first_name);
        CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
      `);
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  const transfersSql = tableSql('transfer_requests');
  if (transfersSql && /to_room_id INTEGER NOT NULL/.test(transfersSql)) {
    const oldCols = tableColumns(db, 'transfer_requests');
    const pick = (column: string, fallback: string) =>
      oldCols.includes(column) ? `"${column}"` : fallback;
    const transferredColumns = [
      'id',
      'student_id',
      'from_dorm_id',
      'from_room_id',
      'to_dorm_id',
      'to_room_id',
      'reason',
      'status',
      'rejection_reason',
      'requested_by',
      'reviewed_by',
      'requested_at',
      'reviewed_at',
    ];
    const selectExpressions = [
      pick('id', 'NULL'),
      pick('student_id', 'NULL'),
      pick('from_dorm_id', 'NULL'),
      pick('from_room_id', 'NULL'),
      pick('to_dorm_id', 'NULL'),
      pick('to_room_id', 'NULL'),
      pick('reason', "''"),
      pick('status', "'در انتظار تأیید'"),
      pick('rejection_reason', 'NULL'),
      pick('requested_by', 'NULL'),
      pick('reviewed_by', 'NULL'),
      pick('requested_at', "datetime('now')"),
      pick('reviewed_at', 'NULL'),
    ];

    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(`
        DROP TABLE IF EXISTS transfer_requests_migrated;
        CREATE TABLE transfer_requests_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
          from_dorm_id INTEGER NOT NULL REFERENCES dormitories(id) ON DELETE RESTRICT,
          from_room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
          to_dorm_id INTEGER NOT NULL REFERENCES dormitories(id) ON DELETE RESTRICT,
          to_room_id INTEGER REFERENCES rooms(id) ON DELETE RESTRICT,
          reason TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'در انتظار تأیید' CHECK(
            status IN ('در انتظار تأیید', 'تأییدشده', 'ردشده', 'لغوشده')
          ),
          rejection_reason TEXT,
          requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          requested_at TEXT NOT NULL DEFAULT (datetime('now')),
          reviewed_at TEXT
        );

        INSERT INTO transfer_requests_migrated (${transferredColumns.join(', ')})
        SELECT ${selectExpressions.join(', ')}
        FROM transfer_requests;

        DROP TABLE transfer_requests;
        ALTER TABLE transfer_requests_migrated RENAME TO transfer_requests;
      `);
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }
}

/** ثبت نسخه‌های اسکیما برای ردیابی مهاجرت‌های آینده. */
function markSchemaMigrations(db: Database.Database) {
  const mark = db.prepare(
    'INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)'
  );
  const tx = db.transaction(() => {
    mark.run(1, 'baseline dormitory schema');
    mark.run(2, 'session revocation store');
    mark.run(3, 'audit metadata and hash chain');
    mark.run(4, 'soft delete for rooms');
    mark.run(5, 'national code uniqueness');
    mark.run(6, 'audit and movement indexes');
  });
  tx();
}

/**
 * افزودن ستون‌های جدید به نصب‌های موجود (مهاجرت غیرمخرب)
 *  - کد ملی، شماره ولی و تصویر دانشجو
 *  - ظرفیت مازاد اتاق و نوع ظرفیت مازاد در اقامت
 *  - یکسان‌سازی عنوان سامانه با نام جدید معاونت
 */
function ensureSchemaColumns(db: Database.Database) {
  const columnsOf = (table: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (c) => c.name
    );

  const addColumn = (table: string, column: string, definition: string) => {
    if (!columnsOf(table).includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  addColumn('users', 'photo_url', 'TEXT');
  addColumn('rooms', 'extra_capacity', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('rooms', 'deleted_at', 'TEXT');
  addColumn('students', 'national_code', "TEXT NOT NULL DEFAULT ''");
  addColumn('students', 'guardian_phone', "TEXT NOT NULL DEFAULT ''");
  addColumn('students', 'photo_url', 'TEXT');
  addColumn('students', 'attendance_type', 'TEXT');
  addColumn(
    'student_residences',
    'is_extra_capacity',
    'INTEGER NOT NULL DEFAULT 0 CHECK(is_extra_capacity IN (0, 1))'
  );

  // ستون‌های امنیتی/ردیابی Audit Log
  addColumn('audit_logs', 'ip_address', "TEXT NOT NULL DEFAULT ''");
  addColumn('audit_logs', 'user_agent', "TEXT NOT NULL DEFAULT ''");
  addColumn('audit_logs', 'prev_hash', "TEXT NOT NULL DEFAULT ''");
  addColumn('audit_logs', 'entry_hash', "TEXT NOT NULL DEFAULT ''");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_rooms_dorm_deleted
      ON rooms(dorm_id, deleted_at);
  `);

  // یکتایی کد ملی غیرخالی؛ در صورت وجود داده تکراری، ساخت ایندکس با هشدار رد می‌شود.
  const duplicateNationalCode = db
    .prepare(
      `SELECT national_code FROM students
       WHERE national_code <> ''
       GROUP BY national_code HAVING COUNT(*) > 1 LIMIT 1`
    )
    .get();
  if (duplicateNationalCode) {
    console.warn('[db] کد ملی تکراری یافت شد؛ ایندکس یکتای کد ملی ساخته نشد.');
  } else {
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_students_national_code
       ON students(national_code) WHERE national_code <> ''`
    );
  }

  // ورودی‌های قدیمی بدون سال (مهر/بهمن) را به قالب «کد سال-نیم‌سال» تبدیل می‌کنیم.
  // ابتدا از سه رقم ابتدای شماره دانشجویی (سال ورود) و برای موارد بدون شماره استاندارد
  // از سال شمسی جاری استفاده می‌شود.
  if (columnsOf('students').includes('entry_term')) {
    db.prepare(
      `UPDATE students
       SET entry_term = substr(student_number, 1, 3) || '-' || entry_term,
           updated_at = datetime('now')
       WHERE entry_term IN ('مهر', 'بهمن')
         AND length(student_number) >= 3
         AND CAST(substr(student_number, 1, 3) AS INTEGER) BETWEEN 380 AND 499`
    ).run();
    const currentYearCode = String(getCurrentShamsiYear() % 1000).padStart(3, '0');
    db.prepare(
      `UPDATE students
       SET entry_term = ? || '-' || entry_term,
           updated_at = datetime('now')
       WHERE entry_term IN ('مهر', 'بهمن')`
    ).run(currentYearCode);
  }

  // یکسان‌سازی عنوان قدیمی سامانه با نام جدید (فقط یک‌بار اجرا می‌شود تا تنظیمات دستی مدیر حفظ شود).
  db.prepare(
    `UPDATE system_settings SET value = ?, updated_at = datetime('now')
     WHERE key = 'systemTitle' AND value = ?`
  ).run('سامانه مدیریت خوابگاه', 'معاونت فرهنگی و دانشجویی');
}

function getInitialPasswords() {
  return {
    admin: process.env.INITIAL_ADMIN_PASSWORD || 'Admin@1404',
    sup1: process.env.INITIAL_SUP1_PASSWORD || 'Fanavari@1404',
    sup2: process.env.INITIAL_SUP2_PASSWORD || 'Maharat@1404',
  };
}

function seedMinimalStructure(db: Database.Database) {
  const passwords = getInitialPasswords();
  const tx = db.transaction(() => {
    const dormStmt = db.prepare(
      'INSERT INTO dormitories (code, name, subtitle, address) VALUES (?, ?, ?, ?)'
    );
    const d1 = dormStmt.run('fanavari', 'پردیس فناوری', 'فنی پسران نیشابور', 'نیشابور، بلوار دانشگاه، مجتمع فنی پسران').lastInsertRowid;
    const d2 = dormStmt.run('maharat', 'پردیس مهارت', 'کشاورزی', 'نیشابور، پردیس کشاورزی و مهارت').lastInsertRowid;

    const userStmt = db.prepare(
      'INSERT INTO users (username, password_hash, full_name, role, dorm_id) VALUES (?, ?, ?, ?, ?)'
    );
    userStmt.run('admin', bcrypt.hashSync(passwords.admin, 10), 'علی محمدی', 'admin', null);
    userStmt.run('sup_fanavari', bcrypt.hashSync(passwords.sup1, 10), 'سعید رضایی', 'supervisor', d1);
    userStmt.run('sup_maharat', bcrypt.hashSync(passwords.sup2, 10), 'رضا کریمی', 'supervisor', d2);

    const settingStmt = db.prepare('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)');
    settingStmt.run('universityName', 'دانشگاه ملی مهارت');
    settingStmt.run('systemTitle', 'سامانه مدیریت خوابگاه');
    settingStmt.run('academicYear', '۱۴۰۴-۱۴۰۵');
    settingStmt.run('currentSemesterTitle', 'نیمسال اول ۱۴۰۴');
  });
  tx();
}

/** تبدیل ورودی نمونه به قالب سال-نیم‌سال بر اساس سال موجود در شماره دانشجویی */
function seedEntryTerm(studentNumber: string, term: string): string {
  const yearCode = studentNumber.slice(0, 3);
  return /^\d{3}$/.test(yearCode) ? `${yearCode}-${term}` : term;
}

function seedInitialData(db: Database.Database) {
  seedMinimalStructure(db);

  const tx = db.transaction(() => {
    const dorms = db.prepare('SELECT id, code FROM dormitories').all() as Array<{ id: number; code: string }>;
    const d1 = dorms.find((d) => d.code === 'fanavari')!.id;
    const d2 = dorms.find((d) => d.code === 'maharat')!.id;

    const adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
    const sup1Id = (db.prepare("SELECT id FROM users WHERE username = 'sup_fanavari'").get() as { id: number }).id;
    const sup2Id = (db.prepare("SELECT id FROM users WHERE username = 'sup_maharat'").get() as { id: number }).id;

    const insertRoom = db.prepare(
      'INSERT INTO rooms (dorm_id, room_number, capacity, floor, notes) VALUES (?, ?, ?, ?, ?)'
    );

    // Dorm 1: پردیس فناوری (6 rooms: 2 full, 3 partial, 1 empty)
    const r1_101 = Number(insertRoom.run(d1, '101', 4, 'طبقه اول', 'نورگیر جنوبی').lastInsertRowid);
    const r1_102 = Number(insertRoom.run(d1, '102', 4, 'طبقه اول', '').lastInsertRowid);
    const r1_103 = Number(insertRoom.run(d1, '103', 6, 'طبقه اول', 'اتاق بزرگ').lastInsertRowid);
    const r1_104 = Number(insertRoom.run(d1, '104', 4, 'طبقه اول', 'تازه‌تعمیر').lastInsertRowid);
    const r1_201 = Number(insertRoom.run(d1, '201', 4, 'طبقه دوم', '').lastInsertRowid);
    const r1_202 = Number(insertRoom.run(d1, '202', 6, 'طبقه دوم', 'مشرف به حیاط').lastInsertRowid);

    // Dorm 2: پردیس مهارت (6 rooms: 1 full, 3 partial, 2 empty)
    const r2_101 = Number(insertRoom.run(d2, '101', 4, 'طبقه اول', 'بال غربی').lastInsertRowid);
    const r2_102 = Number(insertRoom.run(d2, '102', 6, 'طبقه اول', 'اتاق استاندارد').lastInsertRowid);
    const r2_103 = Number(insertRoom.run(d2, '103', 4, 'طبقه اول', '').lastInsertRowid);
    insertRoom.run(d2, '104', 4, 'طبقه اول', 'آماده تحویل');
    const r2_201 = Number(insertRoom.run(d2, '201', 6, 'طبقه دوم', 'نوساز').lastInsertRowid);
    insertRoom.run(d2, '202', 4, 'طبقه دوم', 'ذخیره');

    const insertStudent = db.prepare(`
      INSERT INTO students (student_number, first_name, last_name, city, entry_term, semester, degree, major, mobile, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertResidence = db.prepare(`
      INSERT INTO student_residences (student_id, dorm_id, room_id, is_active, start_date, end_date, exit_reason, created_by)
      VALUES (?, ?, ?, ?, datetime('now', ?), ?, ?, ?)
    `);

    const insertMovement = db.prepare(`
      INSERT INTO room_movements (student_id, from_dorm_id, from_room_id, to_dorm_id, to_room_id, movement_type, reason, performed_by, moved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
    `);

    const dorm1Students: Array<[string, string, string, string, 'مهر' | 'بهمن', number, 'کاردانی' | 'کارشناسی', string, string, number]> = [
      ['40210101', 'امیرحسین', 'اکبری', 'مشهد', 'مهر', 4, 'کارشناسی', 'مهندسی نرم‌افزار', '09151112233', r1_101],
      ['40210102', 'محمدمهدی', 'حسینی', 'سبزوار', 'مهر', 4, 'کارشناسی', 'مهندسی نرم‌افزار', '09152223344', r1_101],
      ['40310103', 'حسین', 'قاسمی', 'کاشمر', 'بهمن', 2, 'کاردانی', 'برق صنعتی', '09353334455', r1_101],
      ['40310104', 'مهدی', 'نوری', 'تربت حیدریه', 'مهر', 3, 'کاردانی', 'الکترونیک', '09154445566', r1_101],

      ['40210201', 'جواد', 'رحیمی', 'بجنورد', 'مهر', 5, 'کارشناسی', 'مهندسی مکانیک', '09155556677', r1_102],
      ['40310202', 'سجاد', 'موسوی', 'شیروان', 'بهمن', 2, 'کاردانی', 'تاسیسات حرارتی', '09366667788', r1_102],
      ['40210203', 'پارسا', 'شریفی', 'بیرجند', 'مهر', 4, 'کارشناسی', 'مهندسی کامپیوتر', '09157778899', r1_102],

      ['40110301', 'یاسین', 'جعفری', 'قوچان', 'مهر', 6, 'کارشناسی', 'مهندسی عمران', '09158889900', r1_103],
      ['40310302', 'طاها', 'کاظمی', 'اسفراین', 'مهر', 3, 'کاردانی', 'ساختمان', '09379990011', r1_103],
      ['40310303', 'سینا', 'باقری', 'گناباد', 'بهمن', 2, 'کارشناسی', 'مهندسی برق', '09151230099', r1_103],
      ['40210304', 'ابوالفضل', 'زارع', 'طبس', 'مهر', 4, 'کاردانی', 'شبکه کامپیوتری', '09153214455', r1_103],

      ['40120101', 'دانیال', 'غلامی', 'مشهد', 'مهر', 7, 'کارشناسی', 'مهندسی نرم‌افزار', '09154567890', r1_201],
      ['40220102', 'عرفان', 'طاهری', 'سمنان', 'بهمن', 4, 'کارشناسی', 'مهندسی صنایع', '09124567811', r1_201],
      ['40320103', 'مبین', 'صادقی', 'شاهرود', 'مهر', 3, 'کاردانی', 'مکانیک خودرو', '09356543210', r1_201],
      ['40320104', 'آرمان', 'یزدانی', 'تایباد', 'بهمن', 2, 'کاردانی', 'متالورژی', '09157654321', r1_201],

      ['40220201', 'کیان', 'فرهادی', 'مشهد', 'مهر', 5, 'کارشناسی', 'مهندسی کامپیوتر', '09152345678', r1_202],
      ['40320202', 'نیما', 'بهرامی', 'چناران', 'مهر', 3, 'کاردانی', 'برق قدرت', '09383456789', r1_202],
    ];

    for (const s of dorm1Students) {
      const sid = Number(insertStudent.run(s[0], s[1], s[2], s[3], seedEntryTerm(s[0], s[4]), s[5], s[6], s[7], s[8], 'ساکن').lastInsertRowid);
      insertResidence.run(sid, d1, s[9], 1, '-20 days', null, null, sup1Id);
      insertMovement.run(sid, null, null, d1, s[9], 'initial', 'ثبت‌نام اولیه در خوابگاه', sup1Id, '-20 days');
    }

    const dorm2Students: Array<[string, string, string, string, 'مهر' | 'بهمن', number, 'کاردانی' | 'کارشناسی', string, string, number]> = [
      ['40230101', 'علی', 'محمدی', 'فریمان', 'مهر', 4, 'کارشناسی', 'مهندسی کشاورزی', '09151002030', r2_102],
      ['40230102', 'حامد', 'سلیمانی', 'درگز', 'مهر', 5, 'کارشناسی', 'مهندسی باغبانی', '09152003040', r2_102],
      ['40330103', 'میلاد', 'یوسفی', 'سرخس', 'بهمن', 2, 'کاردانی', 'تولیدات گیاهی', '09353004050', r2_102],
      ['40330104', 'پویا', 'اسدی', 'کلات', 'مهر', 3, 'کاردانی', 'دامپروری', '09154005060', r2_102],

      ['40130105', 'مجتبی', 'کریمی', 'مشهد', 'مهر', 6, 'کارشناسی', 'علوم خاک', '09155006070', r2_101],
      ['40230106', 'بهزاد', 'توکلی', 'تربت جام', 'بهمن', 4, 'کارشناسی', 'گیاه‌پزشکی', '09156007080', r2_101],
      ['40330107', 'وحید', 'احمدی', 'خلیل‌آباد', 'مهر', 3, 'کاردانی', 'مکانیزاسیون کشاورزی', '09367008090', r2_101],
      ['40330108', 'فرزاد', 'نظری', 'بردسکن', 'بهمن', 2, 'کاردانی', 'صنایع غذایی', '09158009010', r2_101],

      ['40230201', 'سهیل', 'مرادی', 'خواف', 'مهر', 4, 'کارشناسی', 'مهندسی آب', '09159001020', r2_103],
      ['40330202', 'حمید', 'امینی', 'رشتخوار', 'مهر', 3, 'کاردانی', 'پرورش قارچ و گیاهان دارویی', '09371112200', r2_103],
      ['40330203', 'ایمان', 'رستگار', 'فیروزه', 'بهمن', 2, 'کاردانی', 'صنایع غذایی', '09152223300', r2_103],

      ['40130301', 'شایان', 'پناهی', 'سبزوار', 'مهر', 6, 'کارشناسی', 'مهندسی باغبانی', '09153334400', r2_201],
      ['40230302', 'رامتین', 'هاشمی', 'قوچان', 'بهمن', 4, 'کارشناسی', 'مهندسی کشاورزی', '09154445500', r2_201],
      ['40330303', 'نوید', 'قربانی', 'بجنورد', 'مهر', 3, 'کاردانی', 'تولیدات دامی', '09355556600', r2_201],
      ['40330304', 'مازیار', 'صفری', 'اسفراین', 'مهر', 3, 'کاردانی', 'گیاهان دارویی', '09156667700', r2_201],
      ['40230305', 'آرش', 'فلاح', 'مشهد', 'بهمن', 4, 'کارشناسی', 'مهندسی خاک', '09157778800', r2_201],
    ];

    let aliStudentId = 0;
    for (const s of dorm2Students) {
      const sid = Number(insertStudent.run(s[0], s[1], s[2], s[3], seedEntryTerm(s[0], s[4]), s[5], s[6], s[7], s[8], 'ساکن').lastInsertRowid);
      if (s[0] === '40230101') aliStudentId = sid;
      insertResidence.run(sid, d2, s[9], 1, '-15 days', null, null, sup2Id);
      insertMovement.run(sid, null, null, d2, s[9], 'initial', 'ثبت‌نام اولیه در خوابگاه', sup2Id, '-15 days');
    }

    // Add a historical room movement for علی محمدی (from 101 to 102) so residence history has rich data
    if (aliStudentId) {
      db.prepare(`
        INSERT INTO student_residences (student_id, dorm_id, room_id, is_active, start_date, end_date, exit_reason, created_by)
        VALUES (?, ?, ?, 0, datetime('now', '-45 days'), datetime('now', '-15 days'), 'جابه‌جایی به اتاق هم‌رشته‌ها', ?)
      `).run(aliStudentId, d2, r2_101, sup2Id);
      insertMovement.run(aliStudentId, d2, r2_101, d2, r2_102, 'internal', 'تغییر اتاق جهت نزدیکی به هم‌گروهی‌ها', sup2Id, '-15 days');
    }

    // Add 1 inactive student (انصراف از خوابگاه) to show inactive history
    const inactiveId = Number(
      insertStudent.run('40099001', 'محمد', 'رضایی', 'نیشابور', seedEntryTerm('40099001', 'مهر'), 8, 'کارشناسی', 'مهندسی کشاورزی', '09159876543', 'انصراف از خوابگاه').lastInsertRowid
    );
    db.prepare(`
      INSERT INTO student_residences (student_id, dorm_id, room_id, is_active, start_date, end_date, exit_reason, created_by)
      VALUES (?, ?, ?, 0, datetime('now', '-90 days'), datetime('now', '-5 days'), 'انصراف از خوابگاه', ?)
    `).run(inactiveId, d2, r2_103, sup2Id);

    const auditStmt = db.prepare(`
      INSERT INTO audit_logs (user_id, actor_name, dorm_id, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
    `);
    auditStmt.run(adminId, 'علی محمدی', null, 'ثبت دانشجوی جدید', 'student', '40210101', 'ثبت دانشجو امیرحسین اکبری در خوابگاه پردیس فناوری', '-2 hours');
    auditStmt.run(sup2Id, 'رضا کریمی', d2, 'جابه‌جایی دانشجو', 'movement', String(aliStudentId), 'علی محمدی - اتاق ۱۰۲ (انتقال از ۱۰۱)', '-3 hours');
    auditStmt.run(sup2Id, 'رضا کریمی', d2, 'تغییر وضعیت دانشجو', 'student', String(inactiveId), 'محمد رضایی - انصراف از خوابگاه', '-5 hours');
    auditStmt.run(adminId, 'علی محمدی', d1, 'ویرایش اطلاعات دانشجو', 'student', '40210102', 'به‌روزرسانی شماره همراه دانشجو محمدمهدی حسینی', '-1 day');
  });

  tx();
}
