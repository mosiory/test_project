import express, { type Request, type Response, type NextFunction } from 'express';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import {
  SESSION_COOKIE_NAME,
  type AuthedRequest,
  getSessionCookieOptions,
  getTokenFromRequest,
  requireAuth,
  revokeToken,
  signSessionToken,
  verifySessionToken,
} from './auth';
import { ServiceError } from './errors';
import type { AppConfig } from './config';
import { AttemptLimiter, createConcurrencyGuard, isRequestSecure } from './security';
import {
  authenticateUserAsync,
  cancelTransferRequest,
  changeOwnPassword,
  changeStudentStatus,
  checkDatabaseHealth,
  cleanupBackupArtifacts,
  createBackup,
  createRoom,
  createTransferRequest,
  createUser,
  deleteRoom,
  deleteStudent,
  getDashboardData,
  getRoomDetail,
  getSettings,
  getStudentDetail,
  getUserById,
  listAuditLogs,
  listAuditLogsPage,
  listBackups,
  listDormitories,
  listExitRecords,
  listMovements,
  listMovementsPage,
  listRooms,
  listStudents,
  listStudentsPage,
  listTransferRequests,
  listUsers,
  lookupStudentByNumber,
  moveStudentInternal,
  recordAudit,
  registerStudent,
  reviewTransferRequest,
  toggleRoomActive,
  updateDormitory,
  updateOwnProfile,
  updateRoom,
  updateSettings,
  updateStudentInfo,
  updateUser,
  verifyAuditChain,
} from './service';
import {
  readBodyObject,
  readId,
  readOptionalBoolean,
  readOptionalInt,
  readOptionalIsoDate,
  readOptionalPositiveInt,
  readOptionalRawString,
  readOptionalString,
  readPageParams,
  readRequiredBoolean,
  readRequiredRawString,
  readRequiredString,
} from './validation';

export function createApiRouter(db: Database.Database, dataDir: string, config: AppConfig) {
  const router = express.Router();
  const backupDir = path.join(dataDir, 'backups');
  const auth = requireAuth(db);

  const wrap =
    (fn: (req: AuthedRequest, res: Response) => Promise<void> | void) =>
    async (req: AuthedRequest, res: Response, next: NextFunction) => {
      try {
        await fn(req, res);
      } catch (err) {
        next(err);
      }
    };

  // پاسخ‌های API هرگز نباید توسط مرورگر یا پروکسی کش شوند (داده شخصی).
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const loginIpLimiter = new AttemptLimiter(
    config.loginWindowMs,
    config.loginMaxAttemptsPerIp,
    config.loginBlockMs
  );
  const loginUserLimiter = new AttemptLimiter(
    config.loginWindowMs,
    config.loginMaxAttemptsPerUser,
    config.loginBlockMs
  );
  const loginConcurrency = createConcurrencyGuard(4);
  const passwordLimiter = new AttemptLimiter(60 * 60 * 1000, 10, 60 * 60 * 1000);

  // Health check عمومی (بدون داده حساس)
  router.get('/health', (_req, res) => {
    const healthy = checkDatabaseHealth(db);
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  // ---------------- Auth ----------------
  router.post(
    '/auth/login',
    wrap(async (req, res) => {
      const body = readBodyObject(req.body);
      const username = readRequiredString(body.username, 'نام کاربری', 64);
      const password = readRequiredRawString(body.password, 'رمز عبور', 256);
      const ip = req.ip ?? '';
      const userAgent = String(req.headers['user-agent'] ?? '');
      const ipKey = `ip:${ip}`;
      const userKey = `user:${username.toLowerCase()}`;

      const retryAfter = Math.max(
        loginIpLimiter.retryAfterSeconds(ipKey),
        loginUserLimiter.retryAfterSeconds(userKey)
      );
      if (retryAfter > 0) {
        res.setHeader('Retry-After', String(retryAfter));
        throw new ServiceError(
          429,
          `تعداد تلاش‌های ورود بیش از حد مجاز است. لطفاً ${retryAfter} ثانیه دیگر تلاش کنید.`
        );
      }
      if (!loginConcurrency.tryAcquire()) {
        res.setHeader('Retry-After', '5');
        throw new ServiceError(429, 'سامانه در حال پردازش درخواست‌های ورود است. لطفاً کمی بعد تلاش کنید.');
      }

      try {
        const user = await authenticateUserAsync(db, username, password, { ip, userAgent });
        loginIpLimiter.reset(ipKey);
        loginUserLimiter.reset(userKey);

        const token = signSessionToken(db, user.id, { ip, userAgent });
        res.cookie(
          SESSION_COOKIE_NAME,
          token,
          getSessionCookieOptions(isRequestSecure(req, config))
        );
        res.json({ user });
      } catch (err) {
        if (err instanceof ServiceError && (err.statusCode === 401 || err.statusCode === 403)) {
          loginIpLimiter.fail(ipKey);
          loginUserLimiter.fail(userKey);
        }
        throw err;
      } finally {
        loginConcurrency.release();
      }
    })
  );

  router.post(
    '/auth/logout',
    auth,
    wrap((req, res) => {
      const user = req.user!;
      if (req.sessionToken) revokeToken(db, req.sessionToken);
      recordAudit(db, {
        userId: user.id,
        actorName: user.fullName,
        dormId: user.dormId,
        action: 'خروج از سامانه',
        entityType: 'auth',
        entityId: String(user.id),
        details: `خروج کاربر ${user.username}`,
        ipAddress: req.ip ?? '',
        userAgent: String(req.headers['user-agent'] ?? ''),
      });
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.json({ ok: true });
    })
  );

  router.get(
    '/auth/me',
    wrap((req, res) => {
      const token = getTokenFromRequest(req);
      const uid = token ? verifySessionToken(db, token) : null;
      const user = uid ? getUserById(db, uid) : null;
      if (!user || !user.isActive) {
        res.json({ user: null, settings: getSettings(db) });
        return;
      }
      res.json({ user, settings: getSettings(db) });
    })
  );

  router.post(
    '/auth/change-password',
    auth,
    wrap((req, res) => {
      const user = req.user!;
      const limitKey = `user:${user.id}`;
      const retryAfter = passwordLimiter.retryAfterSeconds(limitKey);
      if (retryAfter > 0) {
        res.setHeader('Retry-After', String(retryAfter));
        throw new ServiceError(429, 'تعداد تلاش برای تغییر رمز بیش از حد مجاز است.');
      }

      const body = readBodyObject(req.body);
      const currentPassword = readRequiredRawString(body.currentPassword, 'رمز عبور فعلی', 256);
      const newPassword = readRequiredRawString(body.newPassword, 'رمز عبور جدید', 256);
      try {
        changeOwnPassword(db, user, currentPassword, newPassword);
      } catch (err) {
        passwordLimiter.fail(limitKey);
        throw err;
      }
      passwordLimiter.reset(limitKey);

      // نشست‌های قبلی باطل شده‌اند؛ برای همین مرورگر یک نشست تازه می‌گیرد.
      const token = signSessionToken(db, user.id, {
        ip: req.ip ?? '',
        userAgent: String(req.headers['user-agent'] ?? ''),
      });
      res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(isRequestSecure(req, config)));
      res.json({ ok: true, message: 'رمز عبور با موفقیت تغییر کرد.' });
    })
  );

  router.put(
    '/auth/profile',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      const updated = updateOwnProfile(db, req.user!, {
        fullName: readOptionalString(body.fullName, 'نام نمایشی', 80),
        photoUrl:
          body.photoUrl === undefined
            ? undefined
            : readOptionalString(body.photoUrl, 'تصویر پروفایل', 1_600_000) ?? '',
      });
      res.json({ user: updated });
    })
  );

  // ---------------- Dashboard ----------------
  router.get(
    '/dashboard',
    auth,
    wrap((req, res) => {
      res.json(getDashboardData(db, req.user!));
    })
  );

  // ---------------- Dormitories ----------------
  router.get(
    '/dormitories',
    auth,
    wrap((req, res) => {
      res.json({ dormitories: listDormitories(db, req.user!) });
    })
  );

  router.get(
    '/dormitories/options',
    auth,
    wrap((_req, res) => {
      const dormitories = db
        .prepare('SELECT id, name, subtitle FROM dormitories WHERE is_active = 1 ORDER BY id ASC')
        .all();
      res.json({ dormitories });
    })
  );

  router.put(
    '/dormitories/:id',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      const dorm = updateDormitory(db, req.user!, readId(req.params.id, 'شناسه خوابگاه'), {
        name: readRequiredString(body.name, 'نام خوابگاه', 120),
        subtitle: readOptionalString(body.subtitle, 'زیرعنوان', 120) ?? '',
        address: readOptionalString(body.address, 'آدرس', 300) ?? '',
      });
      res.json({ dormitory: dorm });
    })
  );

  // ---------------- Rooms ----------------
  router.get(
    '/rooms',
    auth,
    wrap((req, res) => {
      res.json({
        rooms: listRooms(db, req.user!, {
          dormId: readOptionalPositiveInt(req.query.dormId, 'شناسه خوابگاه'),
          search: readOptionalString(req.query.search, 'جست‌وجو', 100),
          status: readOptionalString(req.query.status, 'وضعیت', 20),
        }),
      });
    })
  );

  router.get(
    '/rooms/:id',
    auth,
    wrap((req, res) => {
      res.json(getRoomDetail(db, req.user!, readId(req.params.id, 'شناسه اتاق')));
    })
  );

  router.post(
    '/rooms',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      const room = createRoom(db, req.user!, {
        dormId: readOptionalPositiveInt(body.dormId, 'شناسه خوابگاه'),
        roomNumber: readRequiredString(body.roomNumber, 'شماره اتاق', 20),
        capacity: readOptionalPositiveInt(body.capacity, 'ظرفیت اتاق') as number,
        extraCapacity: readOptionalInt(body.extraCapacity, 'ظرفیت مازاد'),
        floor: readOptionalString(body.floor, 'طبقه', 50),
        notes: readOptionalString(body.notes, 'یادداشت', 500),
      });
      res.status(201).json({ room });
    })
  );

  router.put(
    '/rooms/:id',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      const room = updateRoom(db, req.user!, readId(req.params.id, 'شناسه اتاق'), {
        roomNumber: readRequiredString(body.roomNumber, 'شماره اتاق', 20),
        capacity: readOptionalPositiveInt(body.capacity, 'ظرفیت اتاق') as number,
        extraCapacity: readOptionalInt(body.extraCapacity, 'ظرفیت مازاد'),
        floor: readOptionalString(body.floor, 'طبقه', 50),
        notes: readOptionalString(body.notes, 'یادداشت', 500),
      });
      res.json({ room });
    })
  );

  router.delete(
    '/rooms/:id',
    auth,
    wrap((req, res) => {
      const result = deleteRoom(db, req.user!, readId(req.params.id, 'شناسه اتاق'));
      res.json(result);
    })
  );

  router.patch(
    '/rooms/:id/status',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      const isActive = readRequiredBoolean(body.isActive, 'وضعیت فعال بودن اتاق');
      const room = toggleRoomActive(
        db,
        req.user!,
        readId(req.params.id, 'شناسه اتاق'),
        isActive
      );
      res.json({ room });
    })
  );

  // ---------------- Students ----------------
  router.get(
    '/students/lookup',
    auth,
    wrap((req, res) => {
      const studentNumber = readOptionalString(req.query.studentNumber, 'شماره دانشجویی', 20) ?? '';
      res.json(lookupStudentByNumber(db, req.user!, studentNumber));
    })
  );

  const readStudentFilters = (req: AuthedRequest) => ({
    search: readOptionalString(req.query.search, 'جست‌وجو', 100),
    dormId: readOptionalPositiveInt(req.query.dormId, 'شناسه خوابگاه'),
    roomId: readOptionalPositiveInt(req.query.roomId, 'شناسه اتاق'),
    city: readOptionalString(req.query.city, 'شهر', 60),
    major: readOptionalString(req.query.major, 'رشته', 100),
    entryTerm: readOptionalString(req.query.entryTerm, 'ورودی', 20),
    semester: readOptionalInt(req.query.semester, 'ترم'),
    degree: readOptionalString(req.query.degree, 'مقطع', 20),
    status: readOptionalString(req.query.status, 'وضعیت', 40),
  });

  router.get(
    '/students',
    auth,
    wrap((req, res) => {
      const filters = readStudentFilters(req);
      const pagination = readPageParams(req.query);
      if (pagination.page !== undefined && pagination.pageSize !== undefined) {
        res.json(listStudentsPage(db, req.user!, filters, pagination.page, pagination.pageSize));
        return;
      }
      res.json({ students: listStudents(db, req.user!, filters) });
    })
  );

  router.get(
    '/students/:id',
    auth,
    wrap((req, res) => {
      res.json(getStudentDetail(db, req.user!, readId(req.params.id, 'شناسه دانشجو')));
    })
  );

  router.post(
    '/students',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      const student = registerStudent(db, req.user!, {
        firstName: readRequiredString(body.firstName, 'نام', 60),
        lastName: readRequiredString(body.lastName, 'نام خانوادگی', 60),
        studentNumber: readRequiredString(body.studentNumber, 'شماره دانشجویی', 20),
        nationalCode: readOptionalString(body.nationalCode, 'کد ملی', 10) ?? '',
        city: readOptionalString(body.city, 'شهر', 60) ?? '',
        entryTerm: readOptionalString(body.entryTerm, 'ورودی', 20) ?? null,
        semester: readOptionalInt(body.semester, 'ترم') ?? null,
        degree: readOptionalString(body.degree, 'مقطع', 20) as 'کاردانی' | 'کارشناسی' | null,
        major: readOptionalString(body.major, 'رشته', 100) ?? '',
        attendanceType: readOptionalString(body.attendanceType, 'نوع تحصیل', 20) as 'روزانه' | 'شبانه' | null,
        mobile: readRequiredString(body.mobile, 'شماره همراه', 11),
        guardianPhone: readOptionalString(body.guardianPhone, 'شماره ولی', 11) ?? '',
        photoUrl: readOptionalString(body.photoUrl, 'تصویر دانشجو', 1_600_000) ?? '',
        dormId: readOptionalPositiveInt(body.dormId, 'شناسه خوابگاه'),
        roomId: readId(body.roomId, 'شناسه اتاق'),
        isExtraCapacity: readOptionalBoolean(body.isExtraCapacity, 'ظرفیت مازاد') ?? false,
      });
      res.status(201).json({ student });
    })
  );

  router.put(
    '/students/:id',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      const studentId = readId(req.params.id, 'شناسه دانشجو');
      // فقط فیلدهای قابل ویرایش از بدنه استخراج می‌شوند (بدون محل اقامت/وضعیت).
      const student = updateStudentInfo(db, req.user!, studentId, {
        firstName: readOptionalString(body.firstName, 'نام', 60),
        lastName: readOptionalString(body.lastName, 'نام خانوادگی', 60),
        studentNumber: readOptionalString(body.studentNumber, 'شماره دانشجویی', 20),
        nationalCode: readOptionalString(body.nationalCode, 'کد ملی', 10),
        city: readOptionalString(body.city, 'شهر', 60),
        entryTerm: readOptionalString(body.entryTerm, 'ورودی', 20),
        semester: readOptionalInt(body.semester, 'ترم'),
        degree: readOptionalString(body.degree, 'مقطع', 20) as 'کاردانی' | 'کارشناسی' | undefined,
        major: readOptionalString(body.major, 'رشته', 100),
        attendanceType: readOptionalString(body.attendanceType, 'نوع تحصیل', 20) as 'روزانه' | 'شبانه' | undefined,
        mobile: readOptionalString(body.mobile, 'شماره همراه', 11),
        guardianPhone: readOptionalString(body.guardianPhone, 'شماره ولی', 11),
        photoUrl: readOptionalString(body.photoUrl, 'تصویر دانشجو', 1_600_000),
      });
      res.json({ student });
    })
  );

  router.patch(
    '/students/:id/status',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      const student = changeStudentStatus(
        db,
        req.user!,
        readId(req.params.id, 'شناسه دانشجو'),
        String(body.status ?? '') as never,
        readOptionalString(body.reason, 'علت', 500) ?? '',
        readOptionalPositiveInt(body.roomId, 'شناسه اتاق'),
        readOptionalBoolean(body.isExtraCapacity, 'ظرفیت مازاد') ?? false
      );
      res.json({ student });
    })
  );

  router.delete(
    '/students/:id',
    auth,
    wrap((req, res) => {
      const result = deleteStudent(db, req.user!, readId(req.params.id, 'شناسه دانشجو'));
      res.json(result);
    })
  );

  // ---------------- Movements ----------------
  router.get(
    '/movements',
    auth,
    wrap((req, res) => {
      const filters = {
        dormId: readOptionalPositiveInt(req.query.dormId, 'شناسه خوابگاه'),
        search: readOptionalString(req.query.search, 'جست‌وجو', 100),
      };
      const pagination = readPageParams(req.query);
      if (pagination.page !== undefined && pagination.pageSize !== undefined) {
        res.json(listMovementsPage(db, req.user!, filters, pagination.page, pagination.pageSize));
        return;
      }
      res.json({ movements: listMovements(db, req.user!, filters) });
    })
  );

  router.post(
    '/movements',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      const result = moveStudentInternal(db, req.user!, {
        studentId: readId(body.studentId, 'شناسه دانشجو'),
        toRoomId: readId(body.toRoomId, 'شناسه اتاق مقصد'),
        reason: readRequiredString(body.reason, 'علت جابه‌جایی', 500),
        isExtraCapacity: readOptionalBoolean(body.isExtraCapacity, 'ظرفیت مازاد') ?? false,
      });
      res.status(201).json(result);
    })
  );

  // ---------------- Transfer Requests ----------------
  router.get(
    '/transfers',
    auth,
    wrap((req, res) => {
      res.json({
        transfers: listTransferRequests(db, req.user!, {
          status: readOptionalString(req.query.status, 'وضعیت', 40),
        }),
      });
    })
  );

  router.post(
    '/transfers',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      const transfer = createTransferRequest(db, req.user!, {
        studentId: readId(body.studentId, 'شناسه دانشجو'),
        toDormId: readId(body.toDormId, 'شناسه خوابگاه مقصد'),
        toRoomId: readOptionalPositiveInt(body.toRoomId, 'شناسه اتاق مقصد') ?? null,
        reason: readRequiredString(body.reason, 'علت انتقال', 500),
        isExtraCapacity: readOptionalBoolean(body.isExtraCapacity, 'ظرفیت مازاد') ?? false,
        execute: readOptionalBoolean(body.execute, 'اجرای مستقیم') ?? false,
      });
      res.status(201).json({ transfer });
    })
  );

  router.post(
    '/transfers/:id/review',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      const decision = String(body.decision ?? '');
      if (decision !== 'approve' && decision !== 'reject') {
        throw new ServiceError(400, 'نوع تصمیم معتبر نیست.');
      }
      const transfer = reviewTransferRequest(
        db,
        req.user!,
        readId(req.params.id, 'شناسه درخواست'),
        decision,
        readOptionalString(body.rejectionReason, 'علت رد', 500),
        readOptionalPositiveInt(body.toRoomId, 'شناسه اتاق مقصد'),
        readOptionalBoolean(body.isExtraCapacity, 'ظرفیت مازاد') ?? false
      );
      res.json({ transfer });
    })
  );

  router.post(
    '/transfers/:id/cancel',
    auth,
    wrap((req, res) => {
      const transfer = cancelTransferRequest(
        db,
        req.user!,
        readId(req.params.id, 'شناسه درخواست')
      );
      res.json({ transfer });
    })
  );

  // ---------------- Audit Logs ----------------
  router.get(
    '/audit-logs/integrity',
    auth,
    wrap((req, res) => {
      if (req.user!.role !== 'admin') {
        throw new ServiceError(403, 'بررسی سلامت لاگ‌ها فقط برای مسئول کل مجاز است.');
      }
      res.json(verifyAuditChain(db));
    })
  );

  router.get(
    '/audit-logs',
    auth,
    wrap((req, res) => {
      const filters = {
        search: readOptionalString(req.query.search, 'جست‌وجو', 100),
        action: readOptionalString(req.query.action, 'نوع فعالیت', 120),
        dormId: readOptionalPositiveInt(req.query.dormId, 'شناسه خوابگاه'),
        role: readOptionalString(req.query.role, 'نقش', 20),
        fromDate: readOptionalIsoDate(req.query.fromDate, 'تاریخ شروع'),
        toDate: readOptionalIsoDate(req.query.toDate, 'تاریخ پایان'),
        tzOffsetMinutes: config.tzOffsetMinutes,
      };
      const pagination = readPageParams(req.query);
      if (pagination.page !== undefined && pagination.pageSize !== undefined) {
        res.json(
          listAuditLogsPage(db, req.user!, filters, pagination.page, pagination.pageSize)
        );
        return;
      }
      res.json({ logs: listAuditLogs(db, req.user!, filters) });
    })
  );

  // ---------------- Reports ----------------
  router.get(
    '/reports/exits',
    auth,
    wrap((req, res) => {
      res.json({
        exits: listExitRecords(db, req.user!, {
          dormId: readOptionalPositiveInt(req.query.dormId, 'شناسه خوابگاه'),
          fromDate: readOptionalIsoDate(req.query.fromDate, 'تاریخ شروع'),
          toDate: readOptionalIsoDate(req.query.toDate, 'تاریخ پایان'),
          tzOffsetMinutes: config.tzOffsetMinutes,
        }),
      });
    })
  );

  // ---------------- Users (Admin only) ----------------
  router.get(
    '/users',
    auth,
    wrap((req, res) => {
      res.json({ users: listUsers(db, req.user!) });
    })
  );

  router.post(
    '/users',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      if (body.role !== 'admin' && body.role !== 'supervisor') {
        throw new ServiceError(400, 'نقش کاربر معتبر نیست.');
      }
      const created = createUser(db, req.user!, {
        username: readRequiredString(body.username, 'نام کاربری', 32),
        password: readRequiredRawString(body.password, 'رمز عبور', 128),
        fullName: readRequiredString(body.fullName, 'نام و نام خانوادگی', 80),
        role: body.role,
        dormId: readOptionalPositiveInt(body.dormId, 'شناسه خوابگاه') ?? null,
      });
      res.status(201).json({ user: created });
    })
  );

  router.put(
    '/users/:id',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      if (
        body.role !== undefined &&
        body.role !== 'admin' &&
        body.role !== 'supervisor'
      ) {
        throw new ServiceError(400, 'نقش کاربر معتبر نیست.');
      }
      const updated = updateUser(db, req.user!, readId(req.params.id, 'شناسه کاربر'), {
        fullName: readOptionalString(body.fullName, 'نام و نام خانوادگی', 80),
        role: body.role,
        isActive: readOptionalBoolean(body.isActive, 'وضعیت فعال بودن'),
        password: readOptionalRawString(body.password, 'رمز عبور', 128),
        dormId:
          body.dormId === undefined
            ? undefined
            : readOptionalPositiveInt(body.dormId, 'شناسه خوابگاه') ?? null,
      });
      res.json({ user: updated });
    })
  );

  // ---------------- Settings ----------------
  router.get(
    '/settings',
    auth,
    wrap((_req, res) => {
      res.json({ settings: getSettings(db) });
    })
  );

  router.put(
    '/settings',
    auth,
    wrap((req, res) => {
      const body = readBodyObject(req.body);
      const settings = updateSettings(db, req.user!, {
        universityName: readOptionalString(body.universityName, 'نام دانشگاه', 120),
        systemTitle: readOptionalString(body.systemTitle, 'عنوان سامانه', 120),
        academicYear: readOptionalString(body.academicYear, 'سال تحصیلی', 40),
        currentSemesterTitle: readOptionalString(body.currentSemesterTitle, 'عنوان نیمسال', 80),
      });
      res.json({ settings });
    })
  );

  // ---------------- Backups (Admin only) ----------------
  router.get(
    '/backups',
    auth,
    wrap((req, res) => {
      res.json({ backups: listBackups(db, req.user!) });
    })
  );

  router.post(
    '/backups',
    auth,
    wrap(async (req, res) => {
      const body = readBodyObject(req.body);
      const notes = readOptionalString(body.notes, 'یادداشت', 200) ?? '';
      const backup = await createBackup(db, req.user!, backupDir, notes);
      res.status(201).json({ backup });
    })
  );

  router.get(
    '/backups/:id/download',
    auth,
    wrap((req, res) => {
      if (req.user!.role !== 'admin') {
        throw new ServiceError(403, 'فقط مسئول کل مجاز به دانلود نسخه پشتیبان است.');
      }
      const id = readId(req.params.id, 'شناسه نسخه پشتیبان');
      const record = db
        .prepare('SELECT * FROM backup_records WHERE id = ?')
        .get(id) as { file_name: string } | undefined;
      if (!record) throw new ServiceError(404, 'نسخه پشتیبان یافت نشد.');

      const safeName = path.basename(record.file_name);
      const fullPath = path.join(backupDir, safeName);
      if (!fs.existsSync(fullPath)) {
        throw new ServiceError(404, 'فایل پشتیبان در سرور یافت نشد.');
      }

      recordAudit(db, {
        userId: req.user!.id,
        actorName: req.user!.fullName,
        dormId: null,
        action: 'دانلود نسخه پشتیبان',
        entityType: 'backup',
        entityId: String(id),
        details: `دانلود فایل پشتیبان ${safeName}`,
        ipAddress: req.ip ?? '',
        userAgent: String(req.headers['user-agent'] ?? ''),
      });

      res.download(fullPath, safeName);
    })
  );

  router.post(
    '/backups/:id/verify',
    auth,
    wrap((req, res) => {
      if (req.user!.role !== 'admin') {
        throw new ServiceError(403, 'فقط مسئول کل مجاز به بررسی سلامت نسخه پشتیبان است.');
      }
      const id = readId(req.params.id, 'شناسه نسخه پشتیبان');
      const record = db
        .prepare('SELECT * FROM backup_records WHERE id = ?')
        .get(id) as { file_name: string } | undefined;
      if (!record) throw new ServiceError(404, 'نسخه پشتیبان یافت نشد.');

      const safeName = path.basename(record.file_name);
      const fullPath = path.join(backupDir, safeName);
      if (!fs.existsSync(fullPath)) {
        throw new ServiceError(404, 'فایل پشتیبان یافت نشد.');
      }

      let checkRes: unknown = 'unknown';
      const checkDb = new BetterSqlite3(fullPath, { readonly: true });
      try {
        checkRes = checkDb.pragma('integrity_check', { simple: true });
      } finally {
        checkDb.close();
        cleanupBackupArtifacts(fullPath);
      }
      res.json({ ok: checkRes === 'ok', result: checkRes });
    })
  );

  // مسیرهای ناشناختهٔ API باید JSON 404 برگردانند (نه index.html).
  router.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'مسیر API یافت نشد.' });
  });

  // Error handler for /api/*
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Unexpected API error:', err);
    return res.status(500).json({ error: 'خطای داخلی سرور رخ داد. لطفاً مجدداً تلاش کنید.' });
  });

  return router;
}
