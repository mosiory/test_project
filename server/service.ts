import type Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ServiceError } from './errors';
import { revokeUserSessions } from './sessions';
import { localDayBoundsUtc } from './time';
import {
  AuthUser,
  AuditLogRecord,
  BackupRecord,
  Dormitory,
  ExitRecord,
  INACTIVE_STUDENT_STATUSES,
  MovementRecord,
  RoomRecord,
  STUDENT_STATUSES,
  StudentInput,
  StudentRecord,
  StudentStatus,
  SystemSettings,
  TransferRequestRecord,
  UserRole,
  canAssignToRoom,
  canDeactivateRoom,
  canReduceRoomCapacity,
  canUserAccessDorm,
  canUserManageTransfer,
  computeRoomMetrics,
  getEntryTermMonth,
  toEnglishDigits,
  toPersianDigits,
  validateStudentInput,
} from '../src/shared/dormRules';

export { ServiceError };

function assertStrongPassword(password: string): void {
  if (password.length < 8) {
    throw new ServiceError(400, 'رمز عبور باید حداقل ۸ کاراکتر باشد.');
  }
  if (password.length > 128) {
    throw new ServiceError(400, 'رمز عبور بیش از حد مجاز طولانی است.');
  }
  const hasLetter = /[A-Za-z\u0600-\u06FF]/.test(password);
  const hasDigit = /[0-9\u06F0-\u06F9\u0660-\u0669]/.test(password);
  if (!hasLetter || !hasDigit) {
    throw new ServiceError(400, 'رمز عبور باید شامل حروف و اعداد باشد.');
  }
}

export function getUserById(db: Database.Database, userId: number): AuthUser | null {
  const row = db
    .prepare(
      `
      SELECT u.id, u.username, u.full_name, u.role, u.dorm_id, u.photo_url, u.is_active, u.created_at,
             d.name as dorm_name, d.subtitle as dorm_subtitle
      FROM users u
      LEFT JOIN dormitories d ON d.id = u.dorm_id
      WHERE u.id = ?
    `
    )
    .get(userId) as
    | {
        id: number;
        username: string;
        full_name: string;
        role: UserRole;
        dorm_id: number | null;
        photo_url: string | null;
        is_active: number;
        created_at: string;
        dorm_name: string | null;
        dorm_subtitle: string | null;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    dormId: row.dorm_id,
    dormName: row.dorm_name,
    dormSubtitle: row.dorm_subtitle,
    photoUrl: row.photo_url ?? null,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

interface LoginContext {
  ip?: string | null;
  userAgent?: string | null;
}

interface UserAuthRow {
  id: number;
  username: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  dorm_id: number | null;
  photo_url: string | null;
  is_active: number;
  dorm_name: string | null;
  dorm_subtitle: string | null;
}

let dummyPasswordHash: string | null = null;
function getDummyPasswordHash(): string {
  if (!dummyPasswordHash) {
    dummyPasswordHash = bcrypt.hashSync(crypto.randomUUID(), 10);
  }
  return dummyPasswordHash;
}

function loadUserAuthRow(db: Database.Database, username: string): UserAuthRow | undefined {
  return db
    .prepare(
      `
      SELECT u.id, u.username, u.password_hash, u.full_name, u.role, u.dorm_id, u.photo_url, u.is_active,
             d.name as dorm_name, d.subtitle as dorm_subtitle
      FROM users u
      LEFT JOIN dormitories d ON d.id = u.dorm_id
      WHERE u.username = ?
    `
    )
    .get(username) as UserAuthRow | undefined;
}

function toAuthUser(row: UserAuthRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    dormId: row.dorm_id,
    dormName: row.dorm_name,
    dormSubtitle: row.dorm_subtitle,
    photoUrl: row.photo_url ?? null,
    isActive: row.is_active === 1,
  };
}

function auditLoginFailure(
  db: Database.Database,
  username: string,
  reason: string,
  context: LoginContext
) {
  recordAudit(db, {
    userId: null,
    actorName: (username.trim() || 'ناشناس').slice(0, 64),
    dormId: null,
    action: 'ورود ناموفق به سامانه',
    entityType: 'auth',
    entityId: '',
    details: reason,
    ipAddress: context.ip ?? '',
    userAgent: context.userAgent ?? '',
  });
}

function completeLogin(
  db: Database.Database,
  row: UserAuthRow,
  context: LoginContext
): AuthUser {
  recordAudit(db, {
    userId: row.id,
    actorName: row.full_name,
    dormId: row.dorm_id,
    action: 'ورود به سامانه',
    entityType: 'auth',
    entityId: String(row.id),
    details: `ورود کاربر ${row.username} (${row.role === 'admin' ? 'مسئول کل' : row.dorm_name ?? ''})`,
    ipAddress: context.ip ?? '',
    userAgent: context.userAgent ?? '',
  });
  return toAuthUser(row);
}

function assertCredentialsShape(username: string, password: string) {
  if (!username || !password) {
    throw new ServiceError(400, 'نام کاربری و رمز عبور الزامی است.');
  }
  if (username.length > 64 || password.length > 256) {
    throw new ServiceError(400, 'نام کاربری یا رمز عبور بیش از حد مجاز طولانی است.');
  }
}

/** ورود همگام (برای تست‌ها و اسکریپت‌ها). */
export function authenticateUser(
  db: Database.Database,
  username: string,
  password: string,
  context: LoginContext = {}
): AuthUser {
  const cleanUsername = username.trim();
  assertCredentialsShape(cleanUsername, password);

  const row = loadUserAuthRow(db, cleanUsername);
  const hash = row?.password_hash ?? getDummyPasswordHash();
  const passwordMatches = bcrypt.compareSync(password, hash);

  if (!row || !passwordMatches) {
    auditLoginFailure(db, cleanUsername, row ? 'رمز عبور نادرست' : 'نام کاربری ناموجود', context);
    throw new ServiceError(401, 'نام کاربری یا رمز عبور اشتباه است.');
  }
  if (row.is_active !== 1) {
    auditLoginFailure(db, cleanUsername, 'حساب کاربری غیرفعال', context);
    throw new ServiceError(403, 'حساب کاربری شما غیرفعال شده است. با مسئول کل تماس بگیرید.');
  }

  return completeLogin(db, row, context);
}

/**
 * ورود غیرهمگام برای HTTP: مقایسهٔ bcrypt به‌صورت async انجام می‌شود تا
 * درخواست‌های هم‌زمان باعث قفل‌شدن طولانی حلقهٔ رویداد نشوند.
 * مقایسه با هش ساختگی برای کاربر ناموجود نیز زمان پاسخ را یکسان می‌کند.
 */
export async function authenticateUserAsync(
  db: Database.Database,
  username: string,
  password: string,
  context: LoginContext = {}
): Promise<AuthUser> {
  const cleanUsername = username.trim();
  assertCredentialsShape(cleanUsername, password);

  const row = loadUserAuthRow(db, cleanUsername);
  const hash = row?.password_hash ?? getDummyPasswordHash();
  const passwordMatches = await bcrypt.compare(password, hash);

  if (!row || !passwordMatches) {
    auditLoginFailure(db, cleanUsername, row ? 'رمز عبور نادرست' : 'نام کاربری ناموجود', context);
    throw new ServiceError(401, 'نام کاربری یا رمز عبور اشتباه است.');
  }
  if (row.is_active !== 1) {
    auditLoginFailure(db, cleanUsername, 'حساب کاربری غیرفعال', context);
    throw new ServiceError(403, 'حساب کاربری شما غیرفعال شده است. با مسئول کل تماس بگیرید.');
  }

  return completeLogin(db, row, context);
}

function sqlTimestamp(date = new Date()): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function computeAuditHash(prevHash: string, parts: string[]): string {
  return crypto
    .createHash('sha256')
    .update([prevHash, ...parts].join('\n'))
    .digest('hex');
}

export function recordAudit(
  db: Database.Database,
  entry: {
    userId: number | null;
    actorName: string;
    dormId: number | null;
    action: string;
    entityType: string;
    entityId?: string;
    details: string;
    ipAddress?: string;
    userAgent?: string;
  }
) {
  const createdAt = sqlTimestamp();
  const actorName = entry.actorName.slice(0, 200);
  const entityId = entry.entityId ?? '';
  const details = entry.details.slice(0, 2000);
  const ipAddress = (entry.ipAddress ?? '').slice(0, 64);
  const userAgent = (entry.userAgent ?? '').slice(0, 300);

  const previous = db
    .prepare("SELECT entry_hash FROM audit_logs WHERE entry_hash <> '' ORDER BY id DESC LIMIT 1")
    .get() as { entry_hash: string } | undefined;
  const prevHash = previous?.entry_hash ?? '';
  const entryHash = computeAuditHash(prevHash, [
    String(entry.userId ?? ''),
    actorName,
    String(entry.dormId ?? ''),
    entry.action,
    entry.entityType,
    entityId,
    details,
    createdAt,
    ipAddress,
    userAgent,
  ]);

  db.prepare(
    `
    INSERT INTO audit_logs
      (user_id, actor_name, dorm_id, action, entity_type, entity_id, details, created_at,
       ip_address, user_agent, prev_hash, entry_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    entry.userId,
    actorName,
    entry.dormId,
    entry.action,
    entry.entityType,
    entityId,
    details,
    createdAt,
    ipAddress,
    userAgent,
    prevHash,
    entryHash
  );
}

/** بررسی صحت زنجیرهٔ هش لاگ‌های حسابرسی (ردیابی دستکاری). */
export function verifyAuditChain(db: Database.Database): {
  ok: boolean;
  checked: number;
  total: number;
  brokenAt?: number;
} {
  const rows = db
    .prepare(
      `SELECT id, user_id, actor_name, dorm_id, action, entity_type, entity_id, details,
              created_at, ip_address, user_agent, prev_hash, entry_hash
       FROM audit_logs ORDER BY id ASC`
    )
    .all() as Array<{
    id: number;
    user_id: number | null;
    actor_name: string;
    dorm_id: number | null;
    action: string;
    entity_type: string;
    entity_id: string;
    details: string;
    created_at: string;
    ip_address: string;
    user_agent: string;
    prev_hash: string;
    entry_hash: string;
  }>;

  let prevHash = '';
  let checked = 0;
  for (const row of rows) {
    if (!row.entry_hash) continue;
    const computed = computeAuditHash(prevHash, [
      String(row.user_id ?? ''),
      row.actor_name,
      String(row.dorm_id ?? ''),
      row.action,
      row.entity_type,
      row.entity_id,
      row.details,
      row.created_at,
      row.ip_address,
      row.user_agent,
    ]);
    if (row.prev_hash !== prevHash || computed !== row.entry_hash) {
      return { ok: false, checked, total: rows.length, brokenAt: row.id };
    }
    prevHash = row.entry_hash;
    checked += 1;
  }
  return { ok: true, checked, total: rows.length };
}

export function listDormitories(db: Database.Database, user: AuthUser): Dormitory[] {
  const whereClause = user.role === 'supervisor' ? 'WHERE d.id = ?' : '';
  const params = user.role === 'supervisor' ? [user.dormId] : [];

  const rows = db
    .prepare(
      `
      SELECT d.*,
        (SELECT COUNT(*) FROM rooms r WHERE r.dorm_id = d.id AND r.deleted_at IS NULL) as total_rooms,
        (SELECT COUNT(*) FROM rooms r WHERE r.dorm_id = d.id AND r.is_active = 1 AND r.deleted_at IS NULL) as active_rooms,
        (SELECT COALESCE(SUM(r.capacity), 0) FROM rooms r WHERE r.dorm_id = d.id AND r.is_active = 1 AND r.deleted_at IS NULL) as total_capacity,
        (SELECT COALESCE(SUM(r.extra_capacity), 0) FROM rooms r WHERE r.dorm_id = d.id AND r.is_active = 1 AND r.deleted_at IS NULL) as extra_capacity,
        (SELECT COUNT(*) FROM student_residences sr WHERE sr.dorm_id = d.id AND sr.is_active = 1) as occupied_count,
        (SELECT COUNT(*) FROM student_residences sr WHERE sr.dorm_id = d.id AND sr.is_active = 1 AND sr.is_extra_capacity = 1) as extra_occupied,
        (SELECT u.full_name FROM users u WHERE u.dorm_id = d.id AND u.role = 'supervisor' ORDER BY u.is_active DESC, u.id ASC LIMIT 1) as supervisor_name,
        (SELECT u.username FROM users u WHERE u.dorm_id = d.id AND u.role = 'supervisor' ORDER BY u.is_active DESC, u.id ASC LIMIT 1) as supervisor_username
      FROM dormitories d
      ${whereClause}
      ORDER BY d.id ASC
    `
    )
    .all(...params) as Array<{
    id: number;
    code: string;
    name: string;
    subtitle: string;
    address: string;
    is_active: number;
    total_rooms: number;
    active_rooms: number;
    total_capacity: number;
    extra_capacity: number;
    occupied_count: number;
    extra_occupied: number;
    supervisor_name: string | null;
    supervisor_username: string | null;
  }>;

  return rows.map((r) => {
    const baseOccupied = Math.max(0, r.occupied_count - r.extra_occupied);
    const remainingCapacity = Math.max(0, r.total_capacity - baseOccupied);
    const occupancyPercent =
      r.total_capacity > 0 ? Math.min(100, Math.round((baseOccupied / r.total_capacity) * 100)) : 0;
    const extraRemaining = Math.max(0, r.extra_capacity - r.extra_occupied);
    const extraOccupancyPercent =
      r.extra_capacity > 0
        ? Math.min(100, Math.round((r.extra_occupied / r.extra_capacity) * 100))
        : 0;
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      subtitle: r.subtitle,
      address: r.address,
      isActive: r.is_active === 1,
      totalRooms: r.total_rooms,
      activeRooms: r.active_rooms,
      totalCapacity: r.total_capacity,
      occupiedCount: r.occupied_count,
      remainingCapacity,
      extraCapacity: r.extra_capacity,
      extraOccupied: r.extra_occupied,
      extraRemaining,
      extraOccupancyPercent,
      occupancyPercent,
      supervisorName: r.supervisor_name,
      supervisorUsername: r.supervisor_username,
    };
  });
}

export function updateDormitory(
  db: Database.Database,
  user: AuthUser,
  dormId: number,
  payload: { name: string; subtitle: string; address: string }
): Dormitory {
  if (user.role !== 'admin') {
    throw new ServiceError(403, 'فقط مسئول کل سامانه مجاز به ویرایش اطلاعات خوابگاه‌ها است.');
  }
  const existing = db.prepare('SELECT id FROM dormitories WHERE id = ?').get(dormId);
  if (!existing) throw new ServiceError(404, 'خوابگاه موردنظر یافت نشد.');

  const name = (payload.name ?? '').trim();
  const subtitle = (payload.subtitle ?? '').trim();
  const address = (payload.address ?? '').trim();
  if (name.length < 2) throw new ServiceError(400, 'نام خوابگاه الزامی است.');

  db.prepare(
    `UPDATE dormitories SET name = ?, subtitle = ?, address = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name, subtitle, address, dormId);

  recordAudit(db, {
    userId: user.id,
    actorName: user.fullName,
    dormId,
    action: 'ویرایش اطلاعات خوابگاه',
    entityType: 'dormitory',
    entityId: String(dormId),
    details: `ویرایش مشخصات خوابگاه ${name}`,
  });

  return listDormitories(db, user).find((d) => d.id === dormId)!;
}

export function listRooms(
  db: Database.Database,
  user: AuthUser,
  filters?: { dormId?: number; search?: string; status?: string; includeInactive?: boolean }
): RoomRecord[] {
  const conditions: string[] = ['r.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (user.role === 'supervisor') {
    if (filters?.dormId && filters.dormId !== user.dormId) {
      throw new ServiceError(403, 'شما به اتاق‌های خوابگاه دیگر دسترسی ندارید.');
    }
    conditions.push('r.dorm_id = ?');
    params.push(user.dormId);
  } else if (filters?.dormId) {
    conditions.push('r.dorm_id = ?');
    params.push(filters.dormId);
  }

  if (!filters?.includeInactive) {
    // By default show all in room management unless explicitly filtered, handled below
  }

  if (filters?.search && filters.search.trim()) {
    const q = `%${toEnglishDigits(filters.search.trim())}%`;
    conditions.push('(r.room_number LIKE ? OR r.floor LIKE ? OR r.notes LIKE ?)');
    params.push(q, q, q);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `
      SELECT r.*, d.name as dorm_name,
        (SELECT COUNT(*) FROM student_residences sr WHERE sr.room_id = r.id AND sr.is_active = 1) as occupied_count,
        (SELECT COUNT(*) FROM student_residences sr WHERE sr.room_id = r.id AND sr.is_active = 1 AND sr.is_extra_capacity = 1) as extra_occupied
      FROM rooms r
      JOIN dormitories d ON d.id = r.dorm_id
      ${whereSql}
      ORDER BY r.dorm_id ASC, CAST(r.room_number AS INTEGER) ASC, r.room_number ASC
    `
    )
    .all(...params) as Array<{
    id: number;
    dorm_id: number;
    dorm_name: string;
    room_number: string;
    capacity: number;
    extra_capacity: number;
    floor: string;
    notes: string;
    is_active: number;
    created_at: string;
    updated_at: string;
    occupied_count: number;
    extra_occupied: number;
  }>;

  let result: RoomRecord[] = rows.map((r) => {
    const metrics = computeRoomMetrics(
      r.capacity,
      r.occupied_count,
      r.extra_capacity,
      r.extra_occupied
    );
    return {
      id: r.id,
      dormId: r.dorm_id,
      dormName: r.dorm_name,
      roomNumber: r.room_number,
      floor: r.floor,
      notes: r.notes,
      isActive: r.is_active === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ...metrics,
    };
  });

  if (filters?.status === 'full') {
    result = result.filter((r) => r.isActive && r.status === 'full');
  } else if (filters?.status === 'available') {
    result = result.filter((r) => r.isActive && r.remaining > 0);
  } else if (filters?.status === 'empty') {
    result = result.filter((r) => r.isActive && r.status === 'empty');
  } else if (filters?.status === 'extra') {
    result = result.filter((r) => r.isActive && r.extraRemaining > 0);
  } else if (filters?.status === 'inactive') {
    result = result.filter((r) => !r.isActive);
  }

  return result;
}

export function getRoomDetail(db: Database.Database, user: AuthUser, roomId: number) {
  const row = db
    .prepare(
      `
      SELECT r.*, d.name as dorm_name,
        (SELECT COUNT(*) FROM student_residences sr WHERE sr.room_id = r.id AND sr.is_active = 1) as occupied_count,
        (SELECT COUNT(*) FROM student_residences sr WHERE sr.room_id = r.id AND sr.is_active = 1 AND sr.is_extra_capacity = 1) as extra_occupied
      FROM rooms r
      JOIN dormitories d ON d.id = r.dorm_id
      WHERE r.id = ? AND r.deleted_at IS NULL
    `
    )
    .get(roomId) as
    | {
        id: number;
        dorm_id: number;
        dorm_name: string;
        room_number: string;
        capacity: number;
        extra_capacity: number;
        floor: string;
        notes: string;
        is_active: number;
        created_at: string;
        updated_at: string;
        occupied_count: number;
        extra_occupied: number;
      }
    | undefined;

  if (!row) throw new ServiceError(404, 'اتاق موردنظر یافت نشد.');
  if (!canUserAccessDorm(user, row.dorm_id)) {
    throw new ServiceError(403, 'دسترسی به این اتاق برای شما مجاز نیست.');
  }

  const residents = db
    .prepare(
      `
      SELECT s.*, sr.start_date, sr.is_extra_capacity
      FROM student_residences sr
      JOIN students s ON s.id = sr.student_id
      WHERE sr.room_id = ? AND sr.is_active = 1
      ORDER BY s.last_name ASC, s.first_name ASC
    `
    )
    .all(roomId) as Array<{
    id: number;
    student_number: string;
    first_name: string;
    last_name: string;
    national_code: string;
    city: string;
    entry_term: string | null;
    semester: number;
    degree: 'کاردانی' | 'کارشناسی';
    major: string;
    mobile: string;
    guardian_phone: string;
    photo_url: string | null;
    status: StudentStatus;
    start_date: string;
    is_extra_capacity: number;
  }>;

  return {
    room: {
      id: row.id,
      dormId: row.dorm_id,
      dormName: row.dorm_name,
      roomNumber: row.room_number,
      floor: row.floor,
      notes: row.notes,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...computeRoomMetrics(
        row.capacity,
        row.occupied_count,
        row.extra_capacity,
        row.extra_occupied
      ),
    },
    residents: residents.map((s) => ({
      id: s.id,
      studentNumber: s.student_number,
      firstName: s.first_name,
      lastName: s.last_name,
      nationalCode: s.national_code ?? '',
      city: s.city,
      entryTerm: s.entry_term,
      semester: s.semester,
      degree: s.degree,
      major: s.major,
      mobile: s.mobile,
      guardianPhone: s.guardian_phone ?? '',
      photoUrl: s.photo_url ?? '',
      status: s.status,
      startDate: s.start_date,
      isExtraCapacity: s.is_extra_capacity === 1,
    })),
  };
}

export function createRoom(
  db: Database.Database,
  user: AuthUser,
  payload: {
    dormId?: number;
    roomNumber: string;
    capacity: number;
    extraCapacity?: number;
    floor?: string;
    notes?: string;
  }
): RoomRecord {
  const targetDormId = user.role === 'supervisor' ? user.dormId! : Number(payload.dormId);
  if (!targetDormId || !canUserAccessDorm(user, targetDormId)) {
    throw new ServiceError(403, 'مجوز ثبت اتاق برای این خوابگاه را ندارید.');
  }

  const roomNumber = toEnglishDigits((payload.roomNumber ?? '').trim());
  const capacity = Number(toEnglishDigits(String(payload.capacity ?? '')));
  const extraCapacity = Number(toEnglishDigits(String(payload.extraCapacity ?? 0)));
  const floor = (payload.floor ?? 'طبقه اول').trim() || 'طبقه اول';
  const notes = (payload.notes ?? '').trim();

  if (!roomNumber) throw new ServiceError(400, 'شماره اتاق الزامی است.');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 30) {
    throw new ServiceError(400, 'ظرفیت اتاق باید عدد صحیح مثبت بین ۱ تا ۳۰ نفر باشد.');
  }
  if (!Number.isInteger(extraCapacity) || extraCapacity < 0 || extraCapacity > 30) {
    throw new ServiceError(400, 'ظرفیت مازاد اتاق باید عددی بین ۰ تا ۳۰ نفر باشد.');
  }

  const duplicate = db
    .prepare(
      'SELECT id FROM rooms WHERE dorm_id = ? AND room_number = ? AND deleted_at IS NULL'
    )
    .get(targetDormId, roomNumber);
  if (duplicate) {
    throw new ServiceError(409, `اتاق شماره ${toPersianDigits(roomNumber)} قبلاً در این خوابگاه ثبت شده است.`);
  }

  const dorm = db.prepare('SELECT name FROM dormitories WHERE id = ?').get(targetDormId) as
    | { name: string }
    | undefined;
  if (!dorm) throw new ServiceError(404, 'خوابگاه انتخاب‌شده یافت نشد.');

  const result = db
    .prepare(
      'INSERT INTO rooms (dorm_id, room_number, capacity, extra_capacity, floor, notes) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(targetDormId, roomNumber, capacity, extraCapacity, floor, notes);

  const roomId = Number(result.lastInsertRowid);
  recordAudit(db, {
    userId: user.id,
    actorName: user.fullName,
    dormId: targetDormId,
    action: 'ثبت اتاق جدید',
    entityType: 'room',
    entityId: String(roomId),
    details: `ثبت اتاق ${toPersianDigits(roomNumber)} با ظرفیت ${toPersianDigits(capacity)} نفر${extraCapacity > 0 ? ` و ظرفیت مازاد ${toPersianDigits(extraCapacity)} نفر` : ''} در ${dorm.name}`,
  });

  return getRoomDetail(db, user, roomId).room;
}

export function updateRoom(
  db: Database.Database,
  user: AuthUser,
  roomId: number,
  payload: {
    roomNumber: string;
    capacity: number;
    extraCapacity?: number;
    floor?: string;
    notes?: string;
  }
): RoomRecord {
  const detail = getRoomDetail(db, user, roomId);
  const room = detail.room;

  const roomNumber = toEnglishDigits((payload.roomNumber ?? '').trim());
  const capacity = Number(toEnglishDigits(String(payload.capacity ?? '')));
  const extraCapacity =
    payload.extraCapacity === undefined
      ? room.extraCapacity
      : Number(toEnglishDigits(String(payload.extraCapacity ?? 0)));
  const floor = (payload.floor ?? room.floor).trim() || 'طبقه اول';
  const notes = (payload.notes ?? '').trim();

  if (!roomNumber) throw new ServiceError(400, 'شماره اتاق الزامی است.');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 30) {
    throw new ServiceError(400, 'ظرفیت اتاق باید عدد صحیح مثبت بین ۱ تا ۳۰ باشد.');
  }
  if (!Number.isInteger(extraCapacity) || extraCapacity < 0 || extraCapacity > 30) {
    throw new ServiceError(400, 'ظرفیت مازاد اتاق باید عددی بین ۰ تا ۳۰ نفر باشد.');
  }
  if (extraCapacity < room.extraOccupied) {
    throw new ServiceError(
      400,
      `ظرفیت مازاد جدید از تعداد دانشجویان مازاد فعلی (${toPersianDigits(room.extraOccupied)} نفر) کمتر است.`
    );
  }

  const capacityCheck = canReduceRoomCapacity(capacity, room.baseOccupied);
  if (!capacityCheck.allowed) {
    throw new ServiceError(400, capacityCheck.reason || 'ظرفیت جدید معتبر نیست.');
  }

  const duplicate = db
    .prepare('SELECT id FROM rooms WHERE dorm_id = ? AND room_number = ? AND id != ?')
    .get(room.dormId, roomNumber, roomId);
  if (duplicate) {
    throw new ServiceError(409, `شماره اتاق ${toPersianDigits(roomNumber)} در این خوابگاه تکراری است.`);
  }

  db.prepare(
    `UPDATE rooms SET room_number = ?, capacity = ?, extra_capacity = ?, floor = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(roomNumber, capacity, extraCapacity, floor, notes, roomId);

  recordAudit(db, {
    userId: user.id,
    actorName: user.fullName,
    dormId: room.dormId,
    action: 'ویرایش اتاق',
    entityType: 'room',
    entityId: String(roomId),
    details: `ویرایش اتاق ${toPersianDigits(roomNumber)} (ظرفیت: ${toPersianDigits(capacity)} نفر، ظرفیت مازاد: ${toPersianDigits(extraCapacity)} نفر)`,
  });

  return getRoomDetail(db, user, roomId).room;
}

export function toggleRoomActive(
  db: Database.Database,
  user: AuthUser,
  roomId: number,
  isActive: boolean
): RoomRecord {
  const detail = getRoomDetail(db, user, roomId);
  const room = detail.room;

  if (!isActive) {
    const check = canDeactivateRoom(room.occupied);
    if (!check.allowed) {
      throw new ServiceError(400, check.reason!);
    }
  }

  db.prepare(
    `UPDATE rooms SET is_active = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(isActive ? 1 : 0, roomId);

  recordAudit(db, {
    userId: user.id,
    actorName: user.fullName,
    dormId: room.dormId,
    action: isActive ? 'فعال‌سازی اتاق' : 'غیرفعالسازی اتاق',
    entityType: 'room',
    entityId: String(roomId),
    details: `${isActive ? 'فعال‌سازی' : 'غیرفعالسازی'} اتاق ${toPersianDigits(room.roomNumber)} در ${room.dormName}`,
  });

  return getRoomDetail(db, user, roomId).room;
}

/**
 * حذف اتاق فقط توسط مسئول کل و بدون از بین بردن داده:
 *  - اتاق دارای ساکن فعال قابل حذف نیست (ابتدا باید دانشجو منتقل/خارج شود).
 *  - اگر سابقه‌ای به اتاق وابسته باشد، اتاق «بایگانی» (Soft Delete) می‌شود و
 *    شمارهٔ آن آزاد می‌شود؛ تاریخچهٔ دانشجویان دست‌نخورده می‌ماند.
 *  - فقط اتاق کاملاً بدون سابقه به‌صورت فیزیکی حذف می‌شود.
 */
export function deleteRoom(
  db: Database.Database,
  user: AuthUser,
  roomId: number
): { roomNumber: string; deletedStudents: number; archived: boolean } {
  if (user.role !== 'admin') {
    throw new ServiceError(403, 'حذف اتاق فقط توسط مسئول کل سامانه مجاز است.');
  }

  const detail = getRoomDetail(db, user, roomId);
  const room = detail.room;

  if (detail.residents.length > 0) {
    throw new ServiceError(
      409,
      `اتاق ${toPersianDigits(room.roomNumber)} دارای ${toPersianDigits(detail.residents.length)} دانشجوی ساکن است. ابتدا دانشجویان را منتقل یا وضعیت آن‌ها را تغییر دهید.`
    );
  }

  const references = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM student_residences WHERE room_id = ?) +
         (SELECT COUNT(*) FROM room_movements WHERE from_room_id = ? OR to_room_id = ?) +
         (SELECT COUNT(*) FROM transfer_requests WHERE from_room_id = ? OR to_room_id = ?) as total`
    )
    .get(roomId, roomId, roomId, roomId, roomId) as { total: number };

  const archived = references.total > 0;
  const tx = db.transaction(() => {
    if (archived) {
      db.prepare(
        `UPDATE rooms
         SET is_active = 0, deleted_at = datetime('now'),
             room_number = room_number || '#' || id,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(roomId);
    } else {
      db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
    }

    recordAudit(db, {
      userId: user.id,
      actorName: user.fullName,
      dormId: room.dormId,
      action: archived ? 'بایگانی اتاق' : 'حذف اتاق',
      entityType: 'room',
      entityId: String(roomId),
      details: archived
        ? `بایگانی اتاق ${toPersianDigits(room.roomNumber)} در ${room.dormName} با حفظ سوابق (${toPersianDigits(references.total)} رکورد تاریخی)`
        : `حذف اتاق بدون سابقه ${toPersianDigits(room.roomNumber)} در ${room.dormName}`,
    });
  });
  tx();

  return { roomNumber: room.roomNumber, deletedStudents: 0, archived };
}

function mapStudentRow(r: any): StudentRecord {
  return {
    id: r.id,
    studentNumber: r.student_number,
    firstName: r.first_name,
    lastName: r.last_name,
    nationalCode: r.national_code ?? '',
    city: r.city ?? '',
    entryTerm: r.entry_term ?? null,
    semester: r.semester ?? null,
    degree: r.degree ?? null,
    major: r.major ?? '',
    mobile: r.mobile,
    guardianPhone: r.guardian_phone ?? '',
    photoUrl: r.photo_url ?? '',
    status: r.status,
    isExtraCapacity: r.residence_is_extra === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    currentDormId: r.current_dorm_id ?? null,
    currentDormName: r.current_dorm_name ?? null,
    currentDormSubtitle: r.current_dorm_subtitle ?? null,
    currentRoomId: r.current_room_id ?? null,
    currentRoomNumber: r.current_room_number ?? null,
    residenceStartDate: r.residence_start_date ?? null,
  };
}

const STUDENT_SELECT_SQL = `
  SELECT s.*,
    sr.dorm_id as current_dorm_id,
    d.name as current_dorm_name,
    d.subtitle as current_dorm_subtitle,
    sr.room_id as current_room_id,
    sr.is_extra_capacity as residence_is_extra,
    rm.room_number as current_room_number,
    sr.start_date as residence_start_date
  FROM students s
  LEFT JOIN student_residences sr ON sr.student_id = s.id AND sr.is_active = 1
  LEFT JOIN dormitories d ON d.id = sr.dorm_id
  LEFT JOIN rooms rm ON rm.id = sr.room_id
`;

function getLastResidenceDormId(db: Database.Database, studentId: number): number | null {
  const row = db
    .prepare('SELECT dorm_id FROM student_residences WHERE student_id = ? ORDER BY id DESC LIMIT 1')
    .get(studentId) as { dorm_id: number } | undefined;
  return row?.dorm_id ?? null;
}

/**
 * دسترسی سرپرست به پروندهٔ دانشجو:
 *  - دانشجوی ساکن همان خوابگاه
 *  - یا دانشجوی بدون اقامت فعال که آخرین اقامتش در همان خوابگاه بوده است
 * داشتن سابقهٔ قدیمی در خوابگاه، مجوز خواندن پروندهٔ خوابگاه دیگر را نمی‌دهد.
 */
function supervisorCanAccessStudent(
  db: Database.Database,
  user: AuthUser,
  student: StudentRecord
): boolean {
  if (user.role === 'admin') return true;
  if (user.dormId === null) return false;
  if (student.currentDormId !== null) return student.currentDormId === user.dormId;
  return getLastResidenceDormId(db, student.id) === user.dormId;
}

export interface LimitedStudentLookup {
  id: number;
  studentNumber: string;
  firstName: string;
  lastName: string;
  status: StudentStatus;
  currentDormId: number | null;
  currentDormName: string | null;
  currentDormSubtitle: string | null;
  currentRoomId: number | null;
  currentRoomNumber: string | null;
}

export function lookupStudentByNumber(
  db: Database.Database,
  user: AuthUser,
  rawStudentNumber: string
) {
  const studentNumber = toEnglishDigits((rawStudentNumber ?? '').trim());
  if (!studentNumber) {
    throw new ServiceError(400, 'شماره دانشجویی را وارد کنید.');
  }

  const row = db
    .prepare(`${STUDENT_SELECT_SQL} WHERE s.student_number = ?`)
    .get(studentNumber);

  if (!row) {
    return { exists: false as const };
  }

  const student = mapStudentRow(row);
  const canEdit = supervisorCanAccessStudent(db, user, student);

  // سرپرست خوابگاه دیگر فقط حداقل اطلاعات لازم برای نمایش هشدار را می‌بیند
  // (موبایل، کد ملی، شماره ولی و تصویر ارسال نمی‌شود).
  if (!canEdit) {
    const limited: LimitedStudentLookup = {
      id: student.id,
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      status: student.status,
      currentDormId: student.currentDormId,
      currentDormName: student.currentDormName,
      currentDormSubtitle: student.currentDormSubtitle,
      currentRoomId: student.currentRoomId,
      currentRoomNumber: student.currentRoomNumber,
    };
    return {
      exists: true as const,
      student: limited,
      inSameDorm: false,
      canEdit: false,
      inOtherDorm: true,
    };
  }

  return {
    exists: true as const,
    student,
    inSameDorm:
      user.role === 'admin' ||
      (student.currentDormId !== null && student.currentDormId === user.dormId),
    canEdit: true,
    inOtherDorm: false,
  };
}

export interface StudentListFilters {
  search?: string;
  dormId?: number;
  roomId?: number;
  city?: string;
  major?: string;
  entryTerm?: string;
  semester?: number;
  degree?: string;
  status?: string;
}

const STUDENT_FROM_SQL = `
  FROM students s
  LEFT JOIN student_residences sr ON sr.student_id = s.id AND sr.is_active = 1
  LEFT JOIN rooms rm ON rm.id = sr.room_id
`;

function buildStudentWhere(
  user: AuthUser,
  filters?: StudentListFilters
): { whereSql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (user.role === 'supervisor') {
    if (filters?.dormId && filters.dormId !== user.dormId) {
      throw new ServiceError(403, 'دسترسی به اطلاعات دانشجویان خوابگاه دیگر مجاز نیست.');
    }
    conditions.push(`(
      sr.dorm_id = ?
      OR (
        sr.id IS NULL AND
        (SELECT sr_last.dorm_id FROM student_residences sr_last
         WHERE sr_last.student_id = s.id ORDER BY sr_last.id DESC LIMIT 1) = ?
      )
    )`);
    params.push(user.dormId, user.dormId);
  } else if (filters?.dormId) {
    conditions.push(`(
      sr.dorm_id = ?
      OR (
        sr.id IS NULL AND
        (SELECT sr_last.dorm_id FROM student_residences sr_last
         WHERE sr_last.student_id = s.id ORDER BY sr_last.id DESC LIMIT 1) = ?
      )
    )`);
    params.push(filters.dormId, filters.dormId);
  }

  if (filters?.roomId) {
    conditions.push('sr.room_id = ?');
    params.push(filters.roomId);
  }
  if (filters?.city && filters.city.trim()) {
    conditions.push('s.city LIKE ?');
    params.push(`%${filters.city.trim()}%`);
  }
  if (filters?.major && filters.major.trim()) {
    conditions.push('s.major LIKE ?');
    params.push(`%${filters.major.trim()}%`);
  }
  if (filters?.entryTerm) {
    conditions.push('s.entry_term = ?');
    params.push(filters.entryTerm);
  }
  if (filters?.semester) {
    conditions.push('s.semester = ?');
    params.push(filters.semester);
  }
  if (filters?.degree) {
    conditions.push('s.degree = ?');
    params.push(filters.degree);
  }
  if (filters?.status) {
    conditions.push('s.status = ?');
    params.push(filters.status);
  }
  if (filters?.search && filters.search.trim()) {
    const rawQ = filters.search.trim();
    const engQ = toEnglishDigits(rawQ);
    conditions.push(
      `(s.first_name LIKE ? OR s.last_name LIKE ? OR (s.first_name || ' ' || s.last_name) LIKE ? OR s.student_number LIKE ? OR s.national_code LIKE ? OR s.mobile LIKE ? OR s.guardian_phone LIKE ? OR s.major LIKE ? OR s.city LIKE ? OR rm.room_number LIKE ?)`
    );
    const p = `%${rawQ}%`;
    const pEng = `%${engQ}%`;
    params.push(p, p, p, pEng, pEng, pEng, pEng, p, p, pEng);
  }

  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

export function listStudents(
  db: Database.Database,
  user: AuthUser,
  filters?: StudentListFilters
): StudentRecord[] {
  const { whereSql, params } = buildStudentWhere(user, filters);
  const rows = db
    .prepare(
      `
      ${STUDENT_SELECT_SQL}
      ${whereSql}
      ORDER BY s.updated_at DESC, s.id DESC
    `
    )
    .all(...params);

  return rows.map(mapStudentRow);
}

/** نسخهٔ صفحه‌بندی‌شده برای فهرست‌های بزرگ (بدون تغییر رفتار پیش‌فرض). */
export function listStudentsPage(
  db: Database.Database,
  user: AuthUser,
  filters: StudentListFilters | undefined,
  page: number,
  pageSize: number
): { students: StudentRecord[]; total: number; page: number; pageSize: number } {
  const { whereSql, params } = buildStudentWhere(user, filters);
  const total = (
    db.prepare(`SELECT COUNT(*) as c ${STUDENT_FROM_SQL} ${whereSql}`).get(...params) as {
      c: number;
    }
  ).c;

  const rows = db
    .prepare(
      `
      ${STUDENT_SELECT_SQL}
      ${whereSql}
      ORDER BY s.updated_at DESC, s.id DESC
      LIMIT ? OFFSET ?
    `
    )
    .all(...params, pageSize, (page - 1) * pageSize);

  return { students: rows.map(mapStudentRow), total, page, pageSize };
}

export function getStudentDetail(db: Database.Database, user: AuthUser, studentId: number) {
  const row = db.prepare(`${STUDENT_SELECT_SQL} WHERE s.id = ?`).get(studentId);
  if (!row) throw new ServiceError(404, 'دانشجو یافت نشد.');

  const student = mapStudentRow(row);
  if (!supervisorCanAccessStudent(db, user, student)) {
    throw new ServiceError(403, 'دسترسی به پرونده این دانشجو برای شما مجاز نیست.');
  }

  const residences = db
    .prepare(
      `
      SELECT sr.*, d.name as dorm_name, d.subtitle as dorm_subtitle, rm.room_number,
             COALESCE(u.full_name, 'سیستم') as created_by_name
      FROM student_residences sr
      JOIN dormitories d ON d.id = sr.dorm_id
      JOIN rooms rm ON rm.id = sr.room_id
      LEFT JOIN users u ON u.id = sr.created_by
      WHERE sr.student_id = ?
      ORDER BY sr.is_active DESC, sr.start_date DESC, sr.id DESC
    `
    )
    .all(studentId) as any[];

  const movements = db
    .prepare(
      `
      SELECT m.*,
        s.first_name || ' ' || s.last_name as student_name,
        s.student_number,
        fd.name as from_dorm_name,
        frm.room_number as from_room_number,
        td.name as to_dorm_name,
        trm.room_number as to_room_number,
        COALESCE(u.full_name, 'سیستم') as performed_by_name
      FROM room_movements m
      JOIN students s ON s.id = m.student_id
      LEFT JOIN dormitories fd ON fd.id = m.from_dorm_id
      LEFT JOIN rooms frm ON frm.id = m.from_room_id
      JOIN dormitories td ON td.id = m.to_dorm_id
      JOIN rooms trm ON trm.id = m.to_room_id
      LEFT JOIN users u ON u.id = m.performed_by
      WHERE m.student_id = ?
      ORDER BY m.moved_at DESC, m.id DESC
    `
    )
    .all(studentId) as any[];

  const transfers = db
    .prepare(
      `
      SELECT tr.*,
        s.first_name || ' ' || s.last_name as student_name,
        s.student_number,
        fd.name as from_dorm_name,
        frm.room_number as from_room_number,
        td.name as to_dorm_name,
        trm.room_number as to_room_number,
        COALESCE(req_u.full_name, 'مسئول کل') as requested_by_name,
        rev_u.full_name as reviewed_by_name
      FROM transfer_requests tr
      JOIN students s ON s.id = tr.student_id
      JOIN dormitories fd ON fd.id = tr.from_dorm_id
      JOIN rooms frm ON frm.id = tr.from_room_id
      JOIN dormitories td ON td.id = tr.to_dorm_id
      JOIN rooms trm ON trm.id = tr.to_room_id
      LEFT JOIN users req_u ON req_u.id = tr.requested_by
      LEFT JOIN users rev_u ON rev_u.id = tr.reviewed_by
      WHERE tr.student_id = ?
      ORDER BY tr.requested_at DESC, tr.id DESC
    `
    )
    .all(studentId) as any[];

  return {
    student,
    residences: residences.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      dormId: r.dorm_id,
      dormName: r.dorm_name,
      dormSubtitle: r.dorm_subtitle,
      roomId: r.room_id,
      roomNumber: r.room_number,
      startDate: r.start_date,
      endDate: r.end_date,
      isActive: r.is_active === 1,
      isExtraCapacity: r.is_extra_capacity === 1,
      exitReason: r.exit_reason,
      createdByName: r.created_by_name,
    })),
    movements: movements.map((m) => ({
      id: m.id,
      studentId: m.student_id,
      studentName: m.student_name,
      studentNumber: m.student_number,
      fromDormId: m.from_dorm_id,
      fromDormName: m.from_dorm_name,
      fromRoomId: m.from_room_id,
      fromRoomNumber: m.from_room_number,
      toDormId: m.to_dorm_id,
      toDormName: m.to_dorm_name,
      toRoomId: m.to_room_id,
      toRoomNumber: m.to_room_number,
      movementType: m.movement_type,
      reason: m.reason,
      performedByName: m.performed_by_name,
      movedAt: m.moved_at,
    })),
    transfers: transfers.map((tr) => ({
      id: tr.id,
      studentId: tr.student_id,
      studentName: tr.student_name,
      studentNumber: tr.student_number,
      fromDormId: tr.from_dorm_id,
      fromDormName: tr.from_dorm_name,
      fromRoomId: tr.from_room_id,
      fromRoomNumber: tr.from_room_number,
      toDormId: tr.to_dorm_id,
      toDormName: tr.to_dorm_name,
      toRoomId: tr.to_room_id,
      toRoomNumber: tr.to_room_number,
      reason: tr.reason,
      status: tr.status,
      rejectionReason: tr.rejection_reason,
      requestedByName: tr.requested_by_name,
      reviewedByName: tr.reviewed_by_name,
      requestedAt: tr.requested_at,
      reviewedAt: tr.reviewed_at,
    })),
  };
}

export function registerStudent(
  db: Database.Database,
  user: AuthUser,
  payload: Partial<StudentInput> & {
    dormId?: number;
    roomId: number;
    isExtraCapacity?: boolean;
  }
): StudentRecord {
  const validation = validateStudentInput(payload);
  if (!validation.valid) {
    const firstMsg = Object.values(validation.errors)[0];
    throw new ServiceError(400, firstMsg || 'اطلاعات دانشجو معتبر نیست.');
  }
  const data = validation.normalized;
  const targetDormId = user.role === 'supervisor' ? user.dormId! : Number(payload.dormId);
  const roomId = Number(payload.roomId);
  const isExtraCapacity = payload.isExtraCapacity === true;

  if (!targetDormId || !canUserAccessDorm(user, targetDormId)) {
    throw new ServiceError(403, 'شما مجوز ثبت دانشجو در این خوابگاه را ندارید.');
  }
  if (!roomId) {
    throw new ServiceError(400, 'انتخاب اتاق برای دانشجو الزامی است.');
  }

  const tx = db.transaction(() => {
    const existing = db
      .prepare('SELECT id FROM students WHERE student_number = ?')
      .get(data.studentNumber);
    if (existing) {
      throw new ServiceError(
        409,
        `دانشجو با شماره دانشجویی ${toPersianDigits(data.studentNumber)} قبلاً در سامانه ثبت شده است.`
      );
    }
    if (data.nationalCode) {
      const duplicateNationalCode = db
        .prepare("SELECT id FROM students WHERE national_code = ? AND national_code <> ''")
        .get(data.nationalCode);
      if (duplicateNationalCode) {
        throw new ServiceError(409, 'کد ملی واردشده متعلق به دانشجوی دیگری است.');
      }
    }

    const room = db
      .prepare(
        `
        SELECT r.*, d.name as dorm_name,
          (SELECT COUNT(*) FROM student_residences sr WHERE sr.room_id = r.id AND sr.is_active = 1) as occupied,
          (SELECT COUNT(*) FROM student_residences sr WHERE sr.room_id = r.id AND sr.is_active = 1 AND sr.is_extra_capacity = 1) as extra_occupied
        FROM rooms r
        JOIN dormitories d ON d.id = r.dorm_id
        WHERE r.id = ?
      `
      )
      .get(roomId) as
      | {
          id: number;
          dorm_id: number;
          room_number: string;
          capacity: number;
          extra_capacity: number;
          is_active: number;
          dorm_name: string;
          occupied: number;
          extra_occupied: number;
        }
      | undefined;

    if (!room) throw new ServiceError(404, 'اتاق انتخاب‌شده یافت نشد.');

    const roomCheck = canAssignToRoom(
      {
        isActive: room.is_active === 1,
        capacity: room.capacity,
        occupied: room.occupied,
        extraCapacity: room.extra_capacity,
        extraOccupied: room.extra_occupied,
        dormId: room.dorm_id,
      },
      targetDormId,
      { isExtraCapacity }
    );
    if (!roomCheck.allowed) {
      throw new ServiceError(400, roomCheck.reason!);
    }

    const res = db
      .prepare(
        `
        INSERT INTO students (
          student_number, first_name, last_name, national_code, city, entry_term, semester,
          degree, major, mobile, guardian_phone, photo_url, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ساکن')
      `
      )
      .run(
        data.studentNumber,
        data.firstName,
        data.lastName,
        data.nationalCode,
        data.city,
        data.entryTerm,
        data.semester,
        data.degree,
        data.major,
        data.mobile,
        data.guardianPhone,
        data.photoUrl || null
      );

    const studentId = Number(res.lastInsertRowid);

    db.prepare(
      `
      INSERT INTO student_residences (student_id, dorm_id, room_id, is_active, is_extra_capacity, created_by)
      VALUES (?, ?, ?, 1, ?, ?)
    `
    ).run(studentId, targetDormId, roomId, isExtraCapacity ? 1 : 0, user.id);

    db.prepare(
      `
      INSERT INTO room_movements (student_id, from_dorm_id, from_room_id, to_dorm_id, to_room_id, movement_type, reason, performed_by)
      VALUES (?, NULL, NULL, ?, ?, 'initial', 'ثبت دانشجوی جدید و تخصیص اتاق اولیه', ?)
    `
    ).run(studentId, targetDormId, roomId, user.id);

    recordAudit(db, {
      userId: user.id,
      actorName: user.fullName,
      dormId: targetDormId,
      action: 'ثبت دانشجوی جدید',
      entityType: 'student',
      entityId: String(studentId),
      details: `${data.firstName} ${data.lastName} (${toPersianDigits(data.studentNumber)}) - اتاق ${toPersianDigits(room.room_number)} در ${room.dorm_name}${isExtraCapacity ? ' (ظرفیت مازاد)' : ''}`,
    });

    return studentId;
  });

  const newStudentId = tx();
  return getStudentDetail(db, user, newStudentId).student;
}

export function updateStudentInfo(
  db: Database.Database,
  user: AuthUser,
  studentId: number,
  payload: Partial<StudentInput>
): StudentRecord {
  const detail = getStudentDetail(db, user, studentId);
  const current = detail.student;

  if (
    user.role === 'supervisor' &&
    !supervisorCanAccessStudent(db, user, current)
  ) {
    throw new ServiceError(403, 'ویرایش اطلاعات دانشجوی ساکن در خوابگاه دیگر مجاز نیست.');
  }

  // کلیدهای ارسال‌نشده (undefined) نباید مقادیر فعلی را پاک کنند.
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) merged[key] = value;
  }
  const validation = validateStudentInput(merged as Partial<StudentInput>);
  if (!validation.valid) {
    const firstMsg = Object.values(validation.errors)[0];
    throw new ServiceError(400, firstMsg || 'اطلاعات واردشده معتبر نیست.');
  }
  const data = validation.normalized;

  const duplicate = db
    .prepare('SELECT id FROM students WHERE student_number = ? AND id != ?')
    .get(data.studentNumber, studentId);
  if (duplicate) {
    throw new ServiceError(409, 'شماره دانشجویی واردشده متعلق به دانشجوی دیگری است.');
  }
  if (data.nationalCode) {
    const duplicateNationalCode = db
      .prepare("SELECT id FROM students WHERE national_code = ? AND national_code <> '' AND id != ?")
      .get(data.nationalCode, studentId);
    if (duplicateNationalCode) {
      throw new ServiceError(409, 'کد ملی واردشده متعلق به دانشجوی دیگری است.');
    }
  }

  db.prepare(
    `
    UPDATE students
    SET student_number = ?, first_name = ?, last_name = ?, national_code = ?, city = ?,
        entry_term = ?, semester = ?, degree = ?, major = ?, mobile = ?, guardian_phone = ?,
        photo_url = ?, updated_at = datetime('now')
    WHERE id = ?
  `
  ).run(
    data.studentNumber,
    data.firstName,
    data.lastName,
    data.nationalCode,
    data.city,
    data.entryTerm,
    data.semester,
    data.degree,
    data.major,
    data.mobile,
    data.guardianPhone,
    data.photoUrl || null,
    studentId
  );

  recordAudit(db, {
    userId: user.id,
    actorName: user.fullName,
    dormId: current.currentDormId ?? user.dormId,
    action: 'ویرایش اطلاعات دانشجو',
    entityType: 'student',
    entityId: String(studentId),
    details: `ویرایش مشخصات ${data.firstName} ${data.lastName} (${toPersianDigits(data.studentNumber)})`,
  });

  return getStudentDetail(db, user, studentId).student;
}

export function changeStudentStatus(
  db: Database.Database,
  user: AuthUser,
  studentId: number,
  newStatus: StudentStatus,
  reason: string,
  reactivateRoomId?: number,
  reactivateExtraCapacity?: boolean
): StudentRecord {
  if (!STUDENT_STATUSES.includes(newStatus)) {
    throw new ServiceError(400, 'وضعیت انتخاب‌شده معتبر نیست.');
  }

  const detail = getStudentDetail(db, user, studentId);
  const student = detail.student;

  if (
    user.role === 'supervisor' &&
    !supervisorCanAccessStudent(db, user, student)
  ) {
    throw new ServiceError(403, 'تغییر وضعیت دانشجوی خوابگاه دیگر مجاز نیست.');
  }

  const tx = db.transaction(() => {
    if (INACTIVE_STUDENT_STATUSES.includes(newStatus)) {
      db.prepare(
        `
        UPDATE student_residences
        SET is_active = 0, end_date = datetime('now'), exit_reason = ?
        WHERE student_id = ? AND is_active = 1
      `
      ).run(reason.trim() || newStatus, studentId);

      db.prepare(`UPDATE students SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
        newStatus,
        studentId
      );

      recordAudit(db, {
        userId: user.id,
        actorName: user.fullName,
        dormId: student.currentDormId ?? user.dormId,
        action: 'تغییر وضعیت دانشجو',
        entityType: 'student',
        entityId: String(studentId),
        details: `${student.firstName} ${student.lastName} - ${newStatus}${reason.trim() ? ` (${reason.trim()})` : ''}`,
      });
    } else if (newStatus === 'ساکن') {
      if (student.status === 'ساکن' && student.currentRoomId) {
        return;
      }
      if (!reactivateRoomId) {
        throw new ServiceError(400, 'برای فعال‌سازی مجدد اقامت دانشجو، انتخاب اتاق الزامی است.');
      }
      const room = db
        .prepare(
          `
          SELECT r.*, d.name as dorm_name,
            (SELECT COUNT(*) FROM student_residences sr WHERE sr.room_id = r.id AND sr.is_active = 1) as occupied,
            (SELECT COUNT(*) FROM student_residences sr WHERE sr.room_id = r.id AND sr.is_active = 1 AND sr.is_extra_capacity = 1) as extra_occupied
          FROM rooms r
          JOIN dormitories d ON d.id = r.dorm_id
          WHERE r.id = ?
        `
        )
        .get(reactivateRoomId) as any;

      if (!room) throw new ServiceError(404, 'اتاق انتخاب‌شده یافت نشد.');
      if (!canUserAccessDorm(user, room.dorm_id)) {
        throw new ServiceError(403, 'مجوز تخصیص اتاق در این خوابگاه را ندارید.');
      }
      const isExtraCapacity = reactivateExtraCapacity === true;
      const check = canAssignToRoom(
        {
          isActive: room.is_active === 1,
          capacity: room.capacity,
          occupied: room.occupied,
          extraCapacity: room.extra_capacity,
          extraOccupied: room.extra_occupied,
          dormId: room.dorm_id,
        },
        room.dorm_id,
        { isExtraCapacity }
      );
      if (!check.allowed) throw new ServiceError(400, check.reason!);

      db.prepare(`UPDATE students SET status = 'ساکن', updated_at = datetime('now') WHERE id = ?`).run(
        studentId
      );
      db.prepare(
        `
        INSERT INTO student_residences (student_id, dorm_id, room_id, is_active, is_extra_capacity, created_by)
        VALUES (?, ?, ?, 1, ?, ?)
      `
      ).run(studentId, room.dorm_id, room.id, isExtraCapacity ? 1 : 0, user.id);

      db.prepare(
        `
        INSERT INTO room_movements (student_id, from_dorm_id, from_room_id, to_dorm_id, to_room_id, movement_type, reason, performed_by)
        VALUES (?, NULL, NULL, ?, ?, 'initial', ?, ?)
      `
      ).run(studentId, room.dorm_id, room.id, reason.trim() || 'پذیرش مجدد در خوابگاه', user.id);

      recordAudit(db, {
        userId: user.id,
        actorName: user.fullName,
        dormId: room.dorm_id,
        action: 'بازگشت دانشجو به خوابگاه',
        entityType: 'student',
        entityId: String(studentId),
        details: `${student.firstName} ${student.lastName} - تخصیص مجدد به اتاق ${toPersianDigits(room.room_number)}`,
      });
    }
  });

  tx();
  return getStudentDetail(db, user, studentId).student;
}

export function moveStudentInternal(
  db: Database.Database,
  user: AuthUser,
  payload: { studentId: number; toRoomId: number; reason: string; isExtraCapacity?: boolean }
) {
  const studentId = Number(payload.studentId);
  const toRoomId = Number(payload.toRoomId);
  const reason = (payload.reason ?? '').trim();
  const isExtraCapacity = payload.isExtraCapacity === true;

  if (!studentId || !toRoomId) {
    throw new ServiceError(400, 'انتخاب دانشجو و اتاق مقصد الزامی است.');
  }
  if (reason.length < 3) {
    throw new ServiceError(400, 'لطفاً علت جابه‌جایی را به‌صورت شفاف وارد کنید.');
  }

  const tx = db.transaction(() => {
    const student = db
      .prepare(`${STUDENT_SELECT_SQL} WHERE s.id = ?`)
      .get(studentId) as any;

    if (!student) throw new ServiceError(404, 'دانشجو یافت نشد.');
    if (student.status !== 'ساکن' || !student.current_dorm_id || !student.current_room_id) {
      throw new ServiceError(400, 'فقط دانشجویان دارای وضعیت ساکن فعال قابل جابه‌جایی هستند.');
    }

    if (!canUserAccessDorm(user, student.current_dorm_id)) {
      throw new ServiceError(403, 'شما مجوز جابه‌جایی دانشجوی خوابگاه دیگر را ندارید.');
    }

    if (student.current_room_id === toRoomId) {
      throw new ServiceError(400, 'اتاق مقصد نمی‌تواند با اتاق فعلی یکسان باشد.');
    }

    const toRoom = db
      .prepare(
        `
        SELECT r.*, d.name as dorm_name,
          (SELECT COUNT(*) FROM student_residences sr WHERE sr.room_id = r.id AND sr.is_active = 1) as occupied,
          (SELECT COUNT(*) FROM student_residences sr WHERE sr.room_id = r.id AND sr.is_active = 1 AND sr.is_extra_capacity = 1) as extra_occupied
        FROM rooms r
        JOIN dormitories d ON d.id = r.dorm_id
        WHERE r.id = ?
      `
      )
      .get(toRoomId) as any;

    if (!toRoom) throw new ServiceError(404, 'اتاق مقصد یافت نشد.');

    if (toRoom.dorm_id !== student.current_dorm_id) {
      throw new ServiceError(
        403,
        'جابه‌جایی داخلی فقط بین اتاق‌های همان خوابگاه مجاز است. برای انتقال بین دو خوابگاه از فرآیند درخواست انتقال استفاده کنید.'
      );
    }

    const roomCheck = canAssignToRoom(
      {
        isActive: toRoom.is_active === 1,
        capacity: toRoom.capacity,
        occupied: toRoom.occupied,
        extraCapacity: toRoom.extra_capacity,
        extraOccupied: toRoom.extra_occupied,
        dormId: toRoom.dorm_id,
      },
      student.current_dorm_id,
      { isExtraCapacity }
    );
    if (!roomCheck.allowed) {
      throw new ServiceError(400, roomCheck.reason!);
    }

    // Close active residence
    db.prepare(
      `
      UPDATE student_residences
      SET is_active = 0, end_date = datetime('now'), exit_reason = ?
      WHERE student_id = ? AND is_active = 1
    `
    ).run(`جابه‌جایی به اتاق ${toPersianDigits(toRoom.room_number)}: ${reason}`, studentId);

    // Insert new active residence
    db.prepare(
      `
      INSERT INTO student_residences (student_id, dorm_id, room_id, is_active, is_extra_capacity, created_by)
      VALUES (?, ?, ?, 1, ?, ?)
    `
    ).run(studentId, toRoom.dorm_id, toRoom.id, isExtraCapacity ? 1 : 0, user.id);

    // Record movement
    db.prepare(
      `
      INSERT INTO room_movements (student_id, from_dorm_id, from_room_id, to_dorm_id, to_room_id, movement_type, reason, performed_by)
      VALUES (?, ?, ?, ?, ?, 'internal', ?, ?)
    `
    ).run(
      studentId,
      student.current_dorm_id,
      student.current_room_id,
      toRoom.dorm_id,
      toRoom.id,
      reason,
      user.id
    );

    recordAudit(db, {
      userId: user.id,
      actorName: user.fullName,
      dormId: toRoom.dorm_id,
      action: 'جابه‌جایی دانشجو',
      entityType: 'movement',
      entityId: String(studentId),
      details: `${student.first_name} ${student.last_name} - از اتاق ${toPersianDigits(student.current_room_number)} به اتاق ${toPersianDigits(toRoom.room_number)}${isExtraCapacity ? ' (ظرفیت مازاد)' : ''}`,
    });
  });

  tx();
  return getStudentDetail(db, user, studentId);
}

function buildMovementWhere(
  user: AuthUser,
  filters?: { dormId?: number; search?: string }
): { whereSql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (user.role === 'supervisor') {
    if (filters?.dormId && filters.dormId !== user.dormId) {
      throw new ServiceError(403, 'دسترسی به سوابق جابه‌جایی خوابگاه دیگر مجاز نیست.');
    }
    conditions.push('(m.from_dorm_id = ? OR m.to_dorm_id = ?)');
    params.push(user.dormId, user.dormId);
  } else if (filters?.dormId) {
    conditions.push('(m.from_dorm_id = ? OR m.to_dorm_id = ?)');
    params.push(filters.dormId, filters.dormId);
  }

  if (filters?.search && filters.search.trim()) {
    const q = `%${filters.search.trim()}%`;
    const qEng = `%${toEnglishDigits(filters.search.trim())}%`;
    conditions.push(
      '(s.first_name LIKE ? OR s.last_name LIKE ? OR s.student_number LIKE ? OR m.reason LIKE ?)'
    );
    params.push(q, q, qEng, q);
  }

  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function mapMovementRow(m: any): MovementRecord {
  return {
    id: m.id,
    studentId: m.student_id,
    studentName: m.student_name,
    studentNumber: m.student_number,
    fromDormId: m.from_dorm_id,
    fromDormName: m.from_dorm_name,
    fromRoomId: m.from_room_id,
    fromRoomNumber: m.from_room_number,
    toDormId: m.to_dorm_id,
    toDormName: m.to_dorm_name,
    toRoomId: m.to_room_id,
    toRoomNumber: m.to_room_number,
    movementType: m.movement_type,
    reason: m.reason,
    performedByName: m.performed_by_name,
    movedAt: m.moved_at,
  };
}

const MOVEMENT_SELECT_SQL = `
  SELECT m.*,
    s.first_name || ' ' || s.last_name as student_name,
    s.student_number,
    fd.name as from_dorm_name,
    frm.room_number as from_room_number,
    td.name as to_dorm_name,
    trm.room_number as to_room_number,
    COALESCE(u.full_name, 'سیستم') as performed_by_name
  FROM room_movements m
  JOIN students s ON s.id = m.student_id
  LEFT JOIN dormitories fd ON fd.id = m.from_dorm_id
  LEFT JOIN rooms frm ON frm.id = m.from_room_id
  JOIN dormitories td ON td.id = m.to_dorm_id
  JOIN rooms trm ON trm.id = m.to_room_id
  LEFT JOIN users u ON u.id = m.performed_by
`;

export function listMovements(
  db: Database.Database,
  user: AuthUser,
  filters?: { dormId?: number; search?: string }
): MovementRecord[] {
  const { whereSql, params } = buildMovementWhere(user, filters);
  const rows = db
    .prepare(
      `
      ${MOVEMENT_SELECT_SQL}
      ${whereSql}
      ORDER BY m.moved_at DESC, m.id DESC
    `
    )
    .all(...params) as any[];

  return rows.map(mapMovementRow);
}

export function listMovementsPage(
  db: Database.Database,
  user: AuthUser,
  filters: { dormId?: number; search?: string } | undefined,
  page: number,
  pageSize: number
): { movements: MovementRecord[]; total: number; page: number; pageSize: number } {
  const { whereSql, params } = buildMovementWhere(user, filters);
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM room_movements m
         JOIN students s ON s.id = m.student_id
         ${whereSql}`
      )
      .get(...params) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `
      ${MOVEMENT_SELECT_SQL}
      ${whereSql}
      ORDER BY m.moved_at DESC, m.id DESC
      LIMIT ? OFFSET ?
    `
    )
    .all(...params, pageSize, (page - 1) * pageSize) as any[];

  return { movements: rows.map(mapMovementRow), total, page, pageSize };
}

export function listTransferRequests(
  db: Database.Database,
  user: AuthUser,
  filters?: { status?: string }
): TransferRequestRecord[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (user.role === 'supervisor') {
    conditions.push('(tr.to_dorm_id = ? OR tr.from_dorm_id = ?)');
    params.push(user.dormId, user.dormId);
  }
  if (filters?.status) {
    conditions.push('tr.status = ?');
    params.push(filters.status);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `
      SELECT tr.*,
        s.first_name || ' ' || s.last_name as student_name,
        s.student_number,
        fd.name as from_dorm_name,
        frm.room_number as from_room_number,
        td.name as to_dorm_name,
        trm.room_number as to_room_number,
        COALESCE(req_u.full_name, 'مسئول کل') as requested_by_name,
        rev_u.full_name as reviewed_by_name
      FROM transfer_requests tr
      JOIN students s ON s.id = tr.student_id
      JOIN dormitories fd ON fd.id = tr.from_dorm_id
      JOIN rooms frm ON frm.id = tr.from_room_id
      JOIN dormitories td ON td.id = tr.to_dorm_id
      LEFT JOIN rooms trm ON trm.id = tr.to_room_id
      LEFT JOIN users req_u ON req_u.id = tr.requested_by
      LEFT JOIN users rev_u ON rev_u.id = tr.reviewed_by
      ${whereSql}
      ORDER BY CASE WHEN tr.status = 'در انتظار تأیید' THEN 0 ELSE 1 END, tr.requested_at DESC, tr.id DESC
    `
    )
    .all(...params) as any[];

  return rows.map((r) => ({
    id: r.id,
    studentId: r.student_id,
    studentName: r.student_name,
    studentNumber: r.student_number,
    fromDormId: r.from_dorm_id,
    fromDormName: r.from_dorm_name,
    fromRoomId: r.from_room_id,
    fromRoomNumber: r.from_room_number,
    toDormId: r.to_dorm_id,
    toDormName: r.to_dorm_name,
    toRoomId: r.to_room_id ?? null,
    toRoomNumber: r.to_room_number ?? null,
    reason: r.reason,
    status: r.status,
    rejectionReason: r.rejection_reason,
    requestedById: r.requested_by ?? null,
    requestedByName: r.requested_by_name,
    reviewedByName: r.reviewed_by_name,
    requestedAt: r.requested_at,
    reviewedAt: r.reviewed_at,
  }));
}

export interface CreateTransferInput {
  studentId: number;
  toDormId: number;
  toRoomId?: number | null;
  reason: string;
  /** اسکان در ظرفیت مازاد اتاق مقصد */
  isExtraCapacity?: boolean;
  /** مسئول کل می‌تواند انتقال را بلافاصله اجرا کند */
  execute?: boolean;
}

/** بررسی و اعمال نهایی انتقال (مشترک بین ثبت مستقیم و تأیید درخواست) */
function completeTransfer(
  db: Database.Database,
  user: AuthUser,
  request: {
    id: number;
    student_id: number;
    from_dorm_id: number;
    from_room_id: number;
    to_dorm_id: number;
    to_room_id: number | null;
    reason: string;
  },
  toRoomId: number,
  options?: { direct?: boolean; isExtraCapacity?: boolean }
) {
  const student = db.prepare(`${STUDENT_SELECT_SQL} WHERE s.id = ?`).get(request.student_id) as any;
  if (!student) throw new ServiceError(404, 'دانشجو یافت نشد.');
  if (student.status !== 'ساکن' || student.current_dorm_id !== request.from_dorm_id) {
    throw new ServiceError(400, 'وضعیت فعلی اقامت دانشجو تغییر کرده و امکان تکمیل انتقال وجود ندارد.');
  }
  const isExtraCapacity = options?.isExtraCapacity === true;

  const toRoom = db
    .prepare(
      `
      SELECT r.*, d.name as dorm_name,
        (SELECT COUNT(*) FROM student_residences sr WHERE sr.room_id = r.id AND sr.is_active = 1) as occupied,
        (SELECT COUNT(*) FROM student_residences sr WHERE sr.room_id = r.id AND sr.is_active = 1 AND sr.is_extra_capacity = 1) as extra_occupied
      FROM rooms r
      JOIN dormitories d ON d.id = r.dorm_id
      WHERE r.id = ?
    `
    )
    .get(toRoomId) as any;

  if (!toRoom) throw new ServiceError(404, 'اتاق مقصد یافت نشد.');

  const capCheck = canAssignToRoom(
    {
      isActive: toRoom.is_active === 1,
      capacity: toRoom.capacity,
      occupied: toRoom.occupied,
      extraCapacity: toRoom.extra_capacity,
      extraOccupied: toRoom.extra_occupied,
      dormId: toRoom.dorm_id,
    },
    request.to_dorm_id,
    { isExtraCapacity }
  );
  if (!capCheck.allowed) {
    throw new ServiceError(400, `${capCheck.reason} انتقال انجام نشد.`);
  }

  // بستن اقامت قبلی
  db.prepare(
    `
    UPDATE student_residences
    SET is_active = 0, end_date = datetime('now'), exit_reason = ?
    WHERE student_id = ? AND is_active = 1
  `
  ).run(
    `انتقال به ${toRoom.dorm_name} - اتاق ${toPersianDigits(toRoom.room_number)}`,
    request.student_id
  );

  // افتتاح اقامت جدید
  db.prepare(
    `
    INSERT INTO student_residences (student_id, dorm_id, room_id, is_active, is_extra_capacity, created_by)
    VALUES (?, ?, ?, 1, ?, ?)
  `
  ).run(request.student_id, request.to_dorm_id, toRoomId, isExtraCapacity ? 1 : 0, user.id);

  // ثبت جابه‌جایی
  db.prepare(
    `
    INSERT INTO room_movements (student_id, from_dorm_id, from_room_id, to_dorm_id, to_room_id, movement_type, reason, performed_by)
    VALUES (?, ?, ?, ?, ?, 'transfer', ?, ?)
  `
  ).run(
    request.student_id,
    request.from_dorm_id,
    request.from_room_id,
    request.to_dorm_id,
    toRoomId,
    request.reason,
    user.id
  );

  db.prepare(
    `
    UPDATE transfer_requests
    SET status = 'تأییدشده', to_room_id = ?, reviewed_by = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `
  ).run(toRoomId, user.id, request.id);

  recordAudit(db, {
    userId: user.id,
    actorName: user.fullName,
    dormId: request.to_dorm_id,
    action: options?.direct ? 'انتقال مستقیم دانشجو' : 'تأیید درخواست انتقال',
    entityType: 'transfer_request',
    entityId: String(request.id),
    details: `${student.first_name} ${student.last_name} از ${student.current_dorm_name ?? request.from_dorm_id} به ${toRoom.dorm_name} (اتاق ${toPersianDigits(toRoom.room_number)})${isExtraCapacity ? ' - ظرفیت مازاد' : ''} منتقل شد.`,
  });
}

export function createTransferRequest(
  db: Database.Database,
  user: AuthUser,
  payload: CreateTransferInput
): TransferRequestRecord {
  if (!canUserManageTransfer(user, 'create')) {
    throw new ServiceError(403, 'ثبت درخواست انتقال برای این کاربر مجاز نیست.');
  }

  const studentId = Number(payload.studentId);
  const toDormId = Number(payload.toDormId);
  const requestedRoomId = Number(payload.toRoomId ?? 0);
  const reason = (payload.reason ?? '').trim();
  const executeNow = payload.execute === true;
  const isExtraCapacity = payload.isExtraCapacity === true;

  if (executeNow && user.role !== 'admin') {
    throw new ServiceError(403, 'اجرای مستقیم انتقال فقط برای مسئول کل سامانه مجاز است.');
  }
  if (!studentId || !toDormId) {
    throw new ServiceError(400, 'انتخاب دانشجو و خوابگاه مقصد الزامی است.');
  }
  if (reason.length < 3) {
    throw new ServiceError(400, 'علت انتقال دانشجو باید مشخص شود.');
  }
  // سرپرست خوابگاه به اتاق و ظرفیت خوابگاه مقصد دسترسی ندارد؛ فقط درخواست ثبت می‌کند
  if (user.role === 'admin' && !requestedRoomId) {
    throw new ServiceError(400, 'انتخاب اتاق مقصد الزامی است.');
  }

  const tx = db.transaction(() => {
    const student = db.prepare(`${STUDENT_SELECT_SQL} WHERE s.id = ?`).get(studentId) as any;
    if (!student) throw new ServiceError(404, 'دانشجو یافت نشد.');
    if (student.status !== 'ساکن' || !student.current_dorm_id || !student.current_room_id) {
      throw new ServiceError(400, 'فقط دانشجوی ساکن فعال امکان انتقال بین خوابگاهی دارد.');
    }
    if (student.current_dorm_id === toDormId) {
      throw new ServiceError(400, 'خوابگاه مقصد باید با خوابگاه فعلی دانشجو متفاوت باشد.');
    }
    if (user.role === 'supervisor' && student.current_dorm_id !== user.dormId) {
      throw new ServiceError(403, 'ثبت درخواست انتقال فقط برای دانشجویان خوابگاه شما مجاز است.');
    }

    const pending = db
      .prepare(`SELECT id FROM transfer_requests WHERE student_id = ? AND status = 'در انتظار تأیید'`)
      .get(studentId);
    if (pending) {
      throw new ServiceError(409, 'برای این دانشجو یک درخواست انتقال در انتظار تأیید وجود دارد.');
    }

    // اتاق مقصد فقط برای مسئول کل بررسی می‌شود
    let roomId: number | null = null;
    if (user.role === 'admin') {
      const toRoom = db.prepare('SELECT * FROM rooms WHERE id = ?').get(requestedRoomId) as any;
      if (!toRoom) throw new ServiceError(404, 'اتاق مقصد یافت نشد.');
      if (toRoom.dorm_id !== toDormId) {
        throw new ServiceError(400, 'اتاق انتخاب‌شده متعلق به خوابگاه مقصد نیست.');
      }
      roomId = requestedRoomId;
    }

    const res = db
      .prepare(
        `
        INSERT INTO transfer_requests (student_id, from_dorm_id, from_room_id, to_dorm_id, to_room_id, reason, status, requested_by)
        VALUES (?, ?, ?, ?, ?, ?, 'در انتظار تأیید', ?)
      `
      )
      .run(
        studentId,
        student.current_dorm_id,
        student.current_room_id,
        toDormId,
        roomId,
        reason,
        user.id
      );

    const requestId = Number(res.lastInsertRowid);
    const destDorm = db.prepare('SELECT name FROM dormitories WHERE id = ?').get(toDormId) as
      | { name: string }
      | undefined;

    recordAudit(db, {
      userId: user.id,
      actorName: user.fullName,
      dormId: toDormId,
      action: 'ثبت درخواست انتقال',
      entityType: 'transfer_request',
      entityId: String(requestId),
      details: `درخواست انتقال ${student.first_name} ${student.last_name} از ${student.current_dorm_name} به ${destDorm?.name ?? toDormId}`,
    });

    if (executeNow && roomId) {
      const request = db.prepare('SELECT * FROM transfer_requests WHERE id = ?').get(requestId) as any;
      completeTransfer(db, user, request, roomId, { direct: true, isExtraCapacity });
    }

    return requestId;
  });

  const requestId = tx();
  return listTransferRequests(db, user).find((r) => r.id === requestId)!;
}

export function reviewTransferRequest(
  db: Database.Database,
  user: AuthUser,
  requestId: number,
  decision: 'approve' | 'reject',
  rejectionReason?: string,
  toRoomId?: number,
  isExtraCapacity?: boolean
): TransferRequestRecord {
  const tx = db.transaction(() => {
    const req = db.prepare('SELECT * FROM transfer_requests WHERE id = ?').get(requestId) as any;
    if (!req) throw new ServiceError(404, 'درخواست انتقال یافت نشد.');

    if (!canUserManageTransfer(user, decision, req.to_dorm_id)) {
      throw new ServiceError(
        403,
        'تأیید یا رد این درخواست فقط توسط سرپرست خوابگاه مقصد یا مسئول کل سامانه امکان‌پذیر است.'
      );
    }

    if (req.status !== 'در انتظار تأیید') {
      throw new ServiceError(400, 'این درخواست قبلاً تعیین تکلیف شده است.');
    }

    const student = db.prepare(`${STUDENT_SELECT_SQL} WHERE s.id = ?`).get(req.student_id) as any;
    if (!student) throw new ServiceError(404, 'دانشجو یافت نشد.');

    if (decision === 'reject') {
      const cleanReason = (rejectionReason ?? '').trim();
      if (cleanReason.length < 3) {
        throw new ServiceError(400, 'در صورت رد درخواست انتقال، درج علت رد الزامی است.');
      }

      db.prepare(
        `
        UPDATE transfer_requests
        SET status = 'ردشده', rejection_reason = ?, reviewed_by = ?, reviewed_at = datetime('now')
        WHERE id = ?
      `
      ).run(cleanReason, user.id, requestId);

      recordAudit(db, {
        userId: user.id,
        actorName: user.fullName,
        dormId: req.to_dorm_id,
        action: 'رد درخواست انتقال',
        entityType: 'transfer_request',
        entityId: String(requestId),
        details: `رد انتقال ${student.first_name} ${student.last_name} - علت: ${cleanReason}`,
      });
      return;
    }

    const finalRoomId = Number(toRoomId ?? req.to_room_id ?? 0);
    if (!finalRoomId) {
      throw new ServiceError(
        400,
        'برای تأیید و اجرای انتقال، انتخاب اتاق مقصد توسط خوابگاه مقصد الزامی است.'
      );
    }
    completeTransfer(db, user, req, finalRoomId, {
      isExtraCapacity: isExtraCapacity === true,
    });
  });

  tx();
  return listTransferRequests(db, user).find((r) => r.id === requestId)!;
}

export function cancelTransferRequest(
  db: Database.Database,
  user: AuthUser,
  requestId: number
): TransferRequestRecord {
  if (!canUserManageTransfer(user, 'cancel')) {
    throw new ServiceError(403, 'لغو درخواست انتقال برای این کاربر مجاز نیست.');
  }

  const req = db
    .prepare('SELECT * FROM transfer_requests WHERE id = ?')
    .get(requestId) as any;
  if (!req) throw new ServiceError(404, 'درخواست انتقال یافت نشد.');
  if (user.role === 'supervisor' && req.requested_by !== user.id) {
    throw new ServiceError(403, 'سرپرست فقط می‌تواند درخواست‌های ثبت‌شدهٔ خود را لغو کند.');
  }
  if (req.status !== 'در انتظار تأیید') {
    throw new ServiceError(400, 'فقط درخواست‌های در انتظار تأیید قابل لغو هستند.');
  }

  db.prepare(
    `UPDATE transfer_requests SET status = 'لغوشده', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`
  ).run(user.id, requestId);

  recordAudit(db, {
    userId: user.id,
    actorName: user.fullName,
    dormId: req.to_dorm_id,
    action: 'لغو درخواست انتقال',
    entityType: 'transfer_request',
    entityId: String(requestId),
    details: `لغو درخواست انتقال شماره ${toPersianDigits(requestId)}`,
  });

  return listTransferRequests(db, user).find((r) => r.id === requestId)!;
}

export interface AuditLogFilters {
  search?: string;
  action?: string;
  dormId?: number;
  role?: string;
  fromDate?: string;
  toDate?: string;
  /** اختلاف منطقه زمانی محلی با UTC (پیش‌فرض تهران: ۲۱۰ دقیقه) */
  tzOffsetMinutes?: number;
}

function buildAuditWhere(
  user: AuthUser,
  filters?: AuditLogFilters
): { whereSql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (user.role === 'supervisor') {
    if (filters?.dormId && filters.dormId !== user.dormId) {
      throw new ServiceError(403, 'دسترسی به تاریخچه فعالیت خوابگاه دیگر مجاز نیست.');
    }
    conditions.push('a.dorm_id = ?');
    params.push(user.dormId);
  } else if (filters?.dormId) {
    conditions.push('a.dorm_id = ?');
    params.push(filters.dormId);
  }

  if (filters?.action) {
    conditions.push('a.action = ?');
    params.push(filters.action);
  }
  if (filters?.role) {
    conditions.push("COALESCE(u.role, 'system') = ?");
    params.push(filters.role);
  }

  // فیلتر تاریخ بر مبنای «روز محلی» کاربر انجام می‌شود، نه روز UTC.
  const bounds = localDayBoundsUtc(
    filters?.fromDate,
    filters?.toDate,
    filters?.tzOffsetMinutes ?? 210
  );
  if (bounds.fromUtc) {
    conditions.push('a.created_at >= ?');
    params.push(bounds.fromUtc);
  }
  if (bounds.toUtcExclusive) {
    conditions.push('a.created_at < ?');
    params.push(bounds.toUtcExclusive);
  }

  if (filters?.search && filters.search.trim()) {
    const q = `%${filters.search.trim()}%`;
    conditions.push('(a.actor_name LIKE ? OR a.action LIKE ? OR a.details LIKE ?)');
    params.push(q, q, q);
  }

  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function mapAuditRow(r: any): AuditLogRecord {
  return {
    id: r.id,
    userId: r.user_id,
    actorName: r.actor_name,
    actorRole: r.actor_role,
    dormId: r.dorm_id,
    dormName: r.dorm_name,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    details: r.details,
    ipAddress: r.ip_address ?? '',
    userAgent: r.user_agent ?? '',
    createdAt: r.created_at,
  };
}

export function listAuditLogs(
  db: Database.Database,
  user: AuthUser,
  filters?: AuditLogFilters
): AuditLogRecord[] {
  const { whereSql, params } = buildAuditWhere(user, filters);
  const rows = db
    .prepare(
      `
      SELECT a.*, d.name as dorm_name, COALESCE(u.role, 'system') as actor_role
      FROM audit_logs a
      LEFT JOIN dormitories d ON d.id = a.dorm_id
      LEFT JOIN users u ON u.id = a.user_id
      ${whereSql}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 400
    `
    )
    .all(...params) as any[];

  return rows.map(mapAuditRow);
}

export function listAuditLogsPage(
  db: Database.Database,
  user: AuthUser,
  filters: AuditLogFilters | undefined,
  page: number,
  pageSize: number
): { logs: AuditLogRecord[]; total: number; page: number; pageSize: number } {
  const { whereSql, params } = buildAuditWhere(user, filters);
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${whereSql}`
      )
      .get(...params) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `
      SELECT a.*, d.name as dorm_name, COALESCE(u.role, 'system') as actor_role
      FROM audit_logs a
      LEFT JOIN dormitories d ON d.id = a.dorm_id
      LEFT JOIN users u ON u.id = a.user_id
      ${whereSql}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ? OFFSET ?
    `
    )
    .all(...params, pageSize, (page - 1) * pageSize) as any[];

  return {
    logs: rows.map(mapAuditRow),
    total,
    page,
    pageSize,
  };
}

export function listExitRecords(
  db: Database.Database,
  user: AuthUser,
  filters?: { dormId?: number; fromDate?: string; toDate?: string; tzOffsetMinutes?: number }
): ExitRecord[] {
  const conditions: string[] = [
    'sr.is_active = 0',
    'sr.end_date IS NOT NULL',
    "s.status != 'ساکن'",
    'sr.id = (SELECT MAX(sr2.id) FROM student_residences sr2 WHERE sr2.student_id = sr.student_id)',
  ];
  const params: unknown[] = [];

  if (user.role === 'supervisor') {
    if (filters?.dormId && filters.dormId !== user.dormId) {
      throw new ServiceError(403, 'دسترسی به گزارش خروج دانشجویان خوابگاه دیگر مجاز نیست.');
    }
    conditions.push('sr.dorm_id = ?');
    params.push(user.dormId);
  } else if (filters?.dormId) {
    conditions.push('sr.dorm_id = ?');
    params.push(filters.dormId);
  }

  const bounds = localDayBoundsUtc(
    filters?.fromDate,
    filters?.toDate,
    filters?.tzOffsetMinutes ?? 210
  );
  if (bounds.fromUtc) {
    conditions.push('sr.end_date >= ?');
    params.push(bounds.fromUtc);
  }
  if (bounds.toUtcExclusive) {
    conditions.push('sr.end_date < ?');
    params.push(bounds.toUtcExclusive);
  }

  const rows = db
    .prepare(
      `
      SELECT sr.id as residence_id, sr.student_id, sr.dorm_id, sr.start_date, sr.end_date,
             COALESCE(sr.exit_reason, s.status) as exit_reason,
             s.student_number, (s.first_name || ' ' || s.last_name) as student_name, s.status,
             d.name as dorm_name, rm.room_number
      FROM student_residences sr
      JOIN students s ON s.id = sr.student_id
      JOIN dormitories d ON d.id = sr.dorm_id
      JOIN rooms rm ON rm.id = sr.room_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY sr.end_date DESC, sr.id DESC
    `
    )
    .all(...params) as any[];

  return rows.map((r) => ({
    residenceId: r.residence_id,
    studentId: r.student_id,
    studentNumber: r.student_number,
    studentName: r.student_name,
    status: r.status,
    dormId: r.dorm_id,
    dormName: r.dorm_name,
    roomNumber: r.room_number,
    startDate: r.start_date,
    endDate: r.end_date,
    exitReason: r.exit_reason,
  }));
}

export function getDashboardData(db: Database.Database, user: AuthUser) {
  const dorms = listDormitories(db, user);
  const rooms = listRooms(db, user);
  const activeRooms = rooms.filter((r) => r.isActive);

  const totalCapacity = activeRooms.reduce((acc, r) => acc + r.capacity, 0);
  const totalOccupied = activeRooms.reduce((acc, r) => acc + r.occupied, 0);
  const totalBaseOccupied = activeRooms.reduce((acc, r) => acc + r.baseOccupied, 0);
  const extraCapacity = activeRooms.reduce((acc, r) => acc + r.extraCapacity, 0);
  const extraOccupied = activeRooms.reduce((acc, r) => acc + r.extraOccupied, 0);
  const extraRemaining = Math.max(0, extraCapacity - extraOccupied);
  const remainingCapacity = Math.max(0, totalCapacity - totalBaseOccupied);
  const occupancyPercent =
    totalCapacity > 0 ? Math.min(100, Math.round((totalBaseOccupied / totalCapacity) * 100)) : 0;
  const extraOccupancyPercent =
    extraCapacity > 0 ? Math.min(100, Math.round((extraOccupied / extraCapacity) * 100)) : 0;
  const extraStudentsPercent =
    totalOccupied > 0 ? Math.min(100, Math.round((extraOccupied / totalOccupied) * 100)) : 0;

  // تصویر دانشجویان برای آمار داشبورد لازم نیست و حجم پاسخ را کاهش می‌دهیم
  const students = listStudents(db, user).map((s) => ({ ...s, photoUrl: '' }));
  const activeStudents = students.filter((s) => s.status === 'ساکن');
  const inactiveStudentsCount = students.filter((s) => s.status !== 'ساکن').length;

  const byDegree = {
    کارشناسی: activeStudents.filter((s) => s.degree === 'کارشناسی').length,
    کاردانی: activeStudents.filter((s) => s.degree === 'کاردانی').length,
  };
  const byEntry = {
    مهر: activeStudents.filter((s) => getEntryTermMonth(s.entryTerm) === 'مهر').length,
    بهمن: activeStudents.filter((s) => getEntryTermMonth(s.entryTerm) === 'بهمن').length,
  };

  const majorMap = new Map<string, number>();
  for (const s of activeStudents) {
    majorMap.set(s.major, (majorMap.get(s.major) ?? 0) + 1);
  }
  const byMajor = Array.from(majorMap.entries())
    .map(([major, count]) => ({ major, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const movements = listMovements(db, user).filter((m) => m.movementType !== 'initial');
  const transferRequests = listTransferRequests(db, user);
  const pendingTransfers = transferRequests.filter((t) => t.status === 'در انتظار تأیید');
  const recentLogs = listAuditLogs(db, user).slice(0, 6);

  return {
    dorms,
    summary: {
      totalOccupied,
      totalCapacity,
      remainingCapacity,
      occupancyPercent,
      totalActiveRooms: activeRooms.length,
      fullRoomsCount: activeRooms.filter((r) => r.status === 'full').length,
      availableRoomsCount: activeRooms.filter((r) => r.status === 'available').length,
      emptyRoomsCount: activeRooms.filter((r) => r.status === 'empty').length,
      extraCapacity,
      extraOccupied,
      extraRemaining,
      extraOccupancyPercent,
      extraStudentsPercent,
      extraRoomsCount: activeRooms.filter((r) => r.extraCapacity > 0).length,
      inactiveStudentsCount,
      movementsCount: movements.length,
      pendingTransfersCount: pendingTransfers.length,
    },
    charts: {
      byDegree,
      byEntry,
      byMajor,
    },
    pendingTransfers: pendingTransfers.slice(0, 5),
    recentLogs,
  };
}

export function listUsers(db: Database.Database, user: AuthUser): AuthUser[] {
  if (user.role !== 'admin') {
    throw new ServiceError(403, 'فقط مسئول کل مجاز به مدیریت کاربران است.');
  }

  const rows = db
    .prepare(
      `
      SELECT u.id, u.username, u.full_name, u.role, u.dorm_id, u.photo_url, u.is_active, u.created_at,
             d.name as dorm_name, d.subtitle as dorm_subtitle
      FROM users u
      LEFT JOIN dormitories d ON d.id = u.dorm_id
      ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END, u.id ASC
    `
    )
    .all() as any[];

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    dormId: row.dorm_id,
    dormName: row.dorm_name,
    dormSubtitle: row.dorm_subtitle,
    photoUrl: row.photo_url ?? null,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  }));
}

export function createUser(
  db: Database.Database,
  user: AuthUser,
  payload: { username: string; password: string; fullName: string; role: UserRole; dormId?: number | null }
): AuthUser {
  if (user.role !== 'admin') {
    throw new ServiceError(403, 'فقط مسئول کل مجاز به ایجاد کاربر است.');
  }

  const username = (payload.username ?? '').trim();
  const fullName = (payload.fullName ?? '').trim();
  const password = payload.password ?? '';
  const role: UserRole = payload.role === 'admin' ? 'admin' : 'supervisor';
  const dormId = role === 'supervisor' ? Number(payload.dormId) : null;

  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    throw new ServiceError(400, 'نام کاربری باید انگلیسی و بین ۳ تا ۳۲ کاراکتر باشد.');
  }
  if (fullName.length < 2) throw new ServiceError(400, 'نام و نام خانوادگی الزامی است.');
  assertStrongPassword(password);
  if (role === 'supervisor' && !dormId) {
    throw new ServiceError(400, 'برای سرپرست خوابگاه، انتخاب خوابگاه الزامی است.');
  }

  const dup = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (dup) throw new ServiceError(409, 'این نام کاربری قبلاً ثبت شده است.');

  const hash = bcrypt.hashSync(password, 10);
  const res = db
    .prepare(
      'INSERT INTO users (username, password_hash, full_name, role, dorm_id) VALUES (?, ?, ?, ?, ?)'
    )
    .run(username, hash, fullName, role, dormId);

  const newId = Number(res.lastInsertRowid);
  recordAudit(db, {
    userId: user.id,
    actorName: user.fullName,
    dormId,
    action: 'ایجاد حساب کاربری',
    entityType: 'user',
    entityId: String(newId),
    details: `ایجاد حساب ${fullName} (${username}) با نقش ${role === 'admin' ? 'مسئول کل' : 'سرپرست خوابگاه'}`,
  });

  return getUserById(db, newId)!;
}

export function updateUser(
  db: Database.Database,
  user: AuthUser,
  targetUserId: number,
  payload: { fullName?: string; role?: UserRole; isActive?: boolean; password?: string; dormId?: number | null }
): AuthUser {
  if (user.role !== 'admin') {
    throw new ServiceError(403, 'فقط مسئول کل مجاز به ویرایش حساب کاربری است.');
  }

  const target = getUserById(db, targetUserId);
  if (!target) throw new ServiceError(404, 'کاربر یافت نشد.');
  if (target.id === user.id && payload.isActive === false) {
    throw new ServiceError(400, 'امکان غیرفعالسازی حساب فعال خودتان وجود ندارد.');
  }
  if (target.id === user.id && payload.role && payload.role !== 'admin') {
    throw new ServiceError(400, 'امکان تغییر نقش حساب کاربری فعلی خودتان وجود ندارد.');
  }

  const fullName = payload.fullName !== undefined ? payload.fullName.trim() : target.fullName;
  if (fullName.length < 2) throw new ServiceError(400, 'نام و نام خانوادگی معتبر نیست.');

  const role: UserRole =
    payload.role === 'admin' || payload.role === 'supervisor' ? payload.role : target.role;
  const isActive = payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : target.isActive ? 1 : 0;
  const dormId =
    role === 'admin'
      ? null
      : payload.dormId !== undefined
      ? Number(payload.dormId)
      : target.dormId;

  if (role === 'supervisor' && !dormId) {
    throw new ServiceError(400, 'برای سرپرست خوابگاه، انتخاب خوابگاه الزامی است.');
  }

  // حداقل یک مسئول کل فعال باید باقی بماند.
  const activeAdmins = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND is_active = 1").get() as {
      c: number;
    }
  ).c;
  if (
    target.role === 'admin' &&
    target.isActive &&
    activeAdmins <= 1 &&
    (role !== 'admin' || isActive !== 1)
  ) {
    throw new ServiceError(400, 'حداقل یک حساب مسئول کل فعال باید در سامانه باقی بماند.');
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE users SET full_name = ?, role = ?, is_active = ?, dorm_id = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(fullName, role, isActive, dormId, targetUserId);

    if (payload.password && payload.password.trim()) {
      assertStrongPassword(payload.password);
      const hash = bcrypt.hashSync(payload.password, 10);
      db.prepare(
        `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(hash, targetUserId);
    }

    // تغییر رمز یا غیرفعال‌سازی، همهٔ نشست‌های فعلی کاربر را باطل می‌کند.
    if ((payload.password && payload.password.trim()) || isActive !== 1) {
      revokeUserSessions(db, targetUserId);
    }

    recordAudit(db, {
      userId: user.id,
      actorName: user.fullName,
      dormId,
      action: 'ویرایش حساب کاربری',
      entityType: 'user',
      entityId: String(targetUserId),
      details: `ویرایش حساب ${fullName} (${target.username})${isActive !== 1 ? ' - غیرفعال‌سازی' : ''}`,
    });
  });
  tx();

  return getUserById(db, targetUserId)!;
}

export function updateOwnProfile(
  db: Database.Database,
  user: AuthUser,
  payload: { fullName?: string; photoUrl?: string | null }
): AuthUser {
  const target = getUserById(db, user.id);
  if (!target) throw new ServiceError(404, 'حساب کاربری یافت نشد.');

  const fullName = payload.fullName !== undefined ? payload.fullName.trim() : target.fullName;
  if (fullName.length < 2) {
    throw new ServiceError(400, 'نام و نام خانوادگی باید حداقل ۲ کاراکتر باشد.');
  }

  const photoUrl =
    payload.photoUrl !== undefined
      ? String(payload.photoUrl ?? '').trim() || null
      : target.photoUrl ?? null;

  if (photoUrl) {
    if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(photoUrl)) {
      throw new ServiceError(400, 'فرمت تصویر پروفایل معتبر نیست.');
    }
    if (photoUrl.length > 1_500_000) {
      throw new ServiceError(400, 'حجم تصویر پروفایل بیش از حد مجاز است.');
    }
  }

  db.prepare(
    `UPDATE users SET full_name = ?, photo_url = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(fullName, photoUrl, user.id);

  recordAudit(db, {
    userId: user.id,
    actorName: fullName,
    dormId: target.dormId,
    action: 'ویرایش مشخصات کاربری',
    entityType: 'user',
    entityId: String(user.id),
    details: `به‌روزرسانی نام نمایشی و تصویر پروفایل کاربر ${target.username}`,
  });

  return getUserById(db, user.id)!;
}

export function changeOwnPassword(
  db: Database.Database,
  user: AuthUser,
  currentPassword: string,
  newPassword: string
) {
  if (!currentPassword || !newPassword) {
    throw new ServiceError(400, 'رمز عبور فعلی و رمز عبور جدید الزامی هستند.');
  }
  assertStrongPassword(newPassword);

  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(user.id) as { password_hash: string };

  if (!bcrypt.compareSync(currentPassword, row.password_hash)) {
    throw new ServiceError(400, 'رمز عبور فعلی نادرست است.');
  }

  const tx = db.transaction(() => {
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare(
      `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(hash, user.id);

    // ابطال تمام نشست‌های قبلی؛ مسیر HTTP بلافاصله نشست جدید صادر می‌کند.
    revokeUserSessions(db, user.id);

    recordAudit(db, {
      userId: user.id,
      actorName: user.fullName,
      dormId: user.dormId,
      action: 'تغییر رمز عبور',
      entityType: 'user',
      entityId: String(user.id),
      details: 'تغییر رمز عبور توسط کاربر و ابطال نشست‌های قبلی',
    });
  });
  tx();
}

export function getSettings(db: Database.Database): SystemSettings {
  const rows = db.prepare('SELECT key, value FROM system_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    universityName: map.get('universityName') ?? 'دانشگاه ملی مهارت',
    systemTitle: map.get('systemTitle') ?? 'معاونت فرهنگی و دانشجویی',
    academicYear: map.get('academicYear') ?? '۱۴۰۴-۱۴۰۵',
    currentSemesterTitle: map.get('currentSemesterTitle') ?? 'نیمسال اول ۱۴۰۴',
  };
}

export function updateSettings(
  db: Database.Database,
  user: AuthUser,
  payload: Partial<SystemSettings>
): SystemSettings {
  if (user.role !== 'admin') {
    throw new ServiceError(403, 'فقط مسئول کل مجاز به تغییر تنظیمات اصلی سامانه است.');
  }

  const stmt = db.prepare(
    `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );

  const tx = db.transaction(() => {
    if (payload.universityName !== undefined) stmt.run('universityName', payload.universityName.trim());
    if (payload.systemTitle !== undefined) stmt.run('systemTitle', payload.systemTitle.trim());
    if (payload.academicYear !== undefined) stmt.run('academicYear', payload.academicYear.trim());
    if (payload.currentSemesterTitle !== undefined) {
      stmt.run('currentSemesterTitle', payload.currentSemesterTitle.trim());
    }
    recordAudit(db, {
      userId: user.id,
      actorName: user.fullName,
      dormId: null,
      action: 'به‌روزرسانی تنظیمات سامانه',
      entityType: 'settings',
      entityId: 'system',
      details: 'به‌روزرسانی اطلاعات پایه دانشگاه و سال تحصیلی',
    });
  });

  tx();
  return getSettings(db);
}

function mapBackupRow(r: any): BackupRecord {
  return {
    id: r.id,
    fileName: r.file_name,
    fileSize: r.file_size,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    notes: r.notes,
  };
}

function getBackupRecord(db: Database.Database, id: number): BackupRecord | null {
  const row = db
    .prepare(
      `SELECT b.*, COALESCE(u.full_name, 'سیستم') as created_by_name
       FROM backup_records b
       LEFT JOIN users u ON u.id = b.created_by
       WHERE b.id = ?`
    )
    .get(id) as any;
  return row ? mapBackupRow(row) : null;
}

export function listBackups(db: Database.Database, user: AuthUser): BackupRecord[] {
  if (user.role !== 'admin') {
    throw new ServiceError(403, 'فقط مسئول کل مجاز به مشاهده تاریخچه پشتیبان‌ها است.');
  }

  const rows = db
    .prepare(
      `
      SELECT b.*, COALESCE(u.full_name, 'سیستم') as created_by_name
      FROM backup_records b
      LEFT JOIN users u ON u.id = b.created_by
      ORDER BY b.created_at DESC, b.id DESC
    `
    )
    .all() as any[];

  return rows.map(mapBackupRow);
}

/** حذف فایل‌های جانبی WAL/SHM که هنگام بررسی سلامت بکاپ ساخته می‌شوند. */
export function cleanupBackupArtifacts(fullPath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    try {
      fs.rmSync(`${fullPath}${suffix}`, { force: true });
    } catch {
      // نادیده گرفتن خطای پاک‌سازی فایل جانبی
    }
  }
}

export async function createBackup(
  db: Database.Database,
  /** null یعنی پشتیبان خودکار سیستم (بدون کاربر) */
  user: AuthUser | null,
  backupDir: string,
  notes = ''
): Promise<BackupRecord> {
  if (user && user.role !== 'admin') {
    throw new ServiceError(403, 'فقط مسئول کل مجاز به تهیه نسخه پشتیبان است.');
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `dormitory-backup-${stamp}.db`;
  const fullPath = path.join(backupDir, fileName);

  await db.backup(fullPath);
  cleanupBackupArtifacts(fullPath);
  const stats = fs.statSync(fullPath);

  const res = db
    .prepare('INSERT INTO backup_records (file_name, file_size, created_by, notes) VALUES (?, ?, ?, ?)')
    .run(
      fileName,
      stats.size,
      user?.id ?? null,
      notes.trim() || (user ? 'پشتیبان دستی از پایگاه داده' : 'پشتیبان خودکار از پایگاه داده')
    );

  const id = Number(res.lastInsertRowid);
  recordAudit(db, {
    userId: user?.id ?? null,
    actorName: user?.fullName ?? 'سیستم',
    dormId: null,
    action: 'تهیه نسخه پشتیبان',
    entityType: 'backup',
    entityId: String(id),
    details: `ایجاد فایل پشتیبان ${fileName}`,
  });

  const created = getBackupRecord(db, id);
  if (!created) throw new ServiceError(500, 'ثبت رکورد نسخه پشتیبان انجام نشد.');
  return created;
}

/** حذف بکاپ‌های قدیمی‌تر از بازهٔ نگهداشت + فایل‌های جانبی سرگردان. */
export function pruneBackups(
  db: Database.Database,
  backupDir: string,
  retentionDays: number
): { removedRecords: number; removedFiles: number } {
  const safeDays = Math.max(1, Math.floor(retentionDays));
  const cutoff = Date.now() - safeDays * 24 * 60 * 60 * 1000;
  const rows = db.prepare('SELECT id, file_name, created_at FROM backup_records').all() as Array<{
    id: number;
    file_name: string;
    created_at: string;
  }>;

  let removedRecords = 0;
  let removedFiles = 0;
  const deleteRecord = db.prepare('DELETE FROM backup_records WHERE id = ?');

  for (const row of rows) {
    const createdAt = Date.parse(`${row.created_at.replace(' ', 'T')}Z`);
    if (Number.isFinite(createdAt) && createdAt >= cutoff) continue;
    const fullPath = path.join(backupDir, path.basename(row.file_name));
    try {
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { force: true });
        removedFiles += 1;
      }
    } catch {
      continue;
    }
    deleteRecord.run(row.id);
    removedRecords += 1;
  }

  // پاک‌سازی فایل‌های جانبی SQLite در پوشه بکاپ
  try {
    if (fs.existsSync(backupDir)) {
      for (const name of fs.readdirSync(backupDir)) {
        if (name.endsWith('.db-wal') || name.endsWith('.db-shm')) {
          fs.rmSync(path.join(backupDir, name), { force: true });
          removedFiles += 1;
        }
      }
    }
  } catch {
    // نادیده گرفتن خطای پاک‌سازی
  }

  return { removedRecords, removedFiles };
}

/** زمان‌بند پشتیبان‌گیری خودکار درون‌پروسه‌ای (تک‌نمونه). */
export function startBackupScheduler(
  db: Database.Database,
  backupDir: string,
  intervalHours: number,
  retentionDays: number
): () => void {
  if (intervalHours <= 0) return () => {};

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const backup = await createBackup(db, null, backupDir, 'پشتیبان خودکار زمان‌بندی‌شده');
      const pruned = pruneBackups(db, backupDir, retentionDays);
      console.log(
        `[backup] ${backup.fileName} (${backup.fileSize} bytes) - حذف‌شده: ${pruned.removedRecords} رکورد`
      );
    } catch (err) {
      console.error('[backup] پشتیبان‌گیری خودکار ناموفق بود:', err);
    } finally {
      running = false;
    }
  };

  pruneBackups(db, backupDir, retentionDays);
  const timer = setInterval(run, intervalHours * 60 * 60 * 1000);
  const firstRun = setTimeout(run, 60_000);
  timer.unref?.();
  firstRun.unref?.();

  return () => {
    clearInterval(timer);
    clearTimeout(firstRun);
  };
}

/** بررسی سریع سلامت اتصال دیتابیس برای Health Check. */
export function checkDatabaseHealth(db: Database.Database): boolean {
  try {
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}
