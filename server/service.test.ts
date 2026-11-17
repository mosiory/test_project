import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase } from './db';
import { ENTRY_TERMS } from '../src/shared/dormRules';
import {
  ServiceError,
  authenticateUser,
  cancelTransferRequest,
  changeStudentStatus,
  createRoom,
  createTransferRequest,
  createUser,
  deleteRoom,
  getRoomDetail,
  getStudentDetail,
  listAuditLogs,
  listExitRecords,
  listMovements,
  listRooms,
  listStudents,
  listUsers,
  lookupStudentByNumber,
  moveStudentInternal,
  registerStudent,
  reviewTransferRequest,
  toggleRoomActive,
  updateOwnProfile,
  updateRoom,
  updateStudentInfo,
  updateUser,
  verifyAuditChain,
} from './service';

function setupTestDb() {
  const db = initializeDatabase(':memory:', false);
  const admin = authenticateUser(db, 'admin', process.env.INITIAL_ADMIN_PASSWORD || 'Admin@1404');
  const sup1 = authenticateUser(db, 'sup_fanavari', process.env.INITIAL_SUP1_PASSWORD || 'Fanavari@1404');
  const sup2 = authenticateUser(db, 'sup_maharat', process.env.INITIAL_SUP2_PASSWORD || 'Maharat@1404');
  return { db, admin, sup1, sup2 };
}

test('rooms allow duplicate room numbers across different dorms but reject within same dorm', () => {
  const { db, sup1, sup2 } = setupTestDb();

  const r1 = createRoom(db, sup1, { roomNumber: '101', capacity: 2 });
  const r2 = createRoom(db, sup2, { roomNumber: '101', capacity: 3 });

  assert.equal(r1.roomNumber, '101');
  assert.equal(r2.roomNumber, '101');
  assert.notEqual(r1.dormId, r2.dormId);

  assert.throws(
    () => createRoom(db, sup1, { roomNumber: '101', capacity: 4 }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 409
  );
  db.close();
});

test('student registration prevents duplicate student number and room over-capacity', () => {
  const { db, sup1, sup2 } = setupTestDb();
  const room = createRoom(db, sup1, { roomNumber: '105', capacity: 1 });

  const s1 = registerStudent(db, sup1, {
    firstName: 'حسن',
    lastName: 'اکبری',
    studentNumber: '40410001',
    city: 'نیشابور',
    entryTerm: ENTRY_TERMS[0],
    semester: 1,
    degree: 'کاردانی',
    major: 'برق',
    mobile: '09151110001',
    roomId: room.id,
  });

  assert.equal(s1.currentRoomId, room.id);

  // Duplicate student number rejected even from second dorm
  const room2 = createRoom(db, sup2, { roomNumber: '105', capacity: 2 });
  assert.throws(
    () =>
      registerStudent(db, sup2, {
        firstName: 'حسن',
        lastName: 'اکبری',
        studentNumber: '40410001',
        city: 'نیشابور',
        entryTerm: ENTRY_TERMS[0],
        semester: 1,
        degree: 'کاردانی',
        major: 'برق',
        mobile: '09151110001',
        roomId: room2.id,
      }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 409
  );

  // Over-capacity rejected
  assert.throws(
    () =>
      registerStudent(db, sup1, {
        firstName: 'مهدی',
        lastName: 'رضایی',
        studentNumber: '40410002',
        city: 'مشهد',
        entryTerm: ENTRY_TERMS[1],
        semester: 2,
        degree: 'کارشناسی',
        major: 'کامپیوتر',
        mobile: '09151110002',
        roomId: room.id,
      }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 400
  );

  // Lookup identifies existing student
  const lookup = lookupStudentByNumber(db, sup2, '40410001');
  assert.equal(lookup.exists, true);
  if (lookup.exists) {
    assert.equal(lookup.inOtherDorm, true);
  }
  db.close();
});

test('room capacity reduction and deactivation enforce active resident checks', () => {
  const { db, sup1 } = setupTestDb();
  const room = createRoom(db, sup1, { roomNumber: '205', capacity: 3 });

  const s1 = registerStudent(db, sup1, {
    firstName: 'رضا',
    lastName: 'نوری',
    studentNumber: '40420001',
    city: 'مشهد',
    entryTerm: ENTRY_TERMS[0],
    semester: 2,
    degree: 'کارشناسی',
    major: 'نرم‌افزار',
    mobile: '09152220001',
    roomId: room.id,
  });
  registerStudent(db, sup1, {
    firstName: 'امیر',
    lastName: 'کاظمی',
    studentNumber: '40420002',
    city: 'سبزوار',
    entryTerm: ENTRY_TERMS[0],
    semester: 2,
    degree: 'کارشناسی',
    major: 'نرم‌افزار',
    mobile: '09152220002',
    roomId: room.id,
  });

  // Cannot reduce below 2
  assert.throws(
    () => updateRoom(db, sup1, room.id, { roomNumber: '205', capacity: 1 }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 400
  );

  // Can reduce to 2
  const updated = updateRoom(db, sup1, room.id, { roomNumber: '205', capacity: 2 });
  assert.equal(updated.remaining, 0);
  assert.equal(updated.status, 'full');

  // Cannot deactivate occupied room
  assert.throws(
    () => toggleRoomActive(db, sup1, room.id, false),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 400
  );

  // Exit student frees capacity
  changeStudentStatus(db, sup1, s1.id, 'انصراف از خوابگاه', 'انصراف شخصی');
  const afterExit = listRooms(db, sup1).find((r) => r.id === room.id)!;
  assert.equal(afterExit.occupied, 1);
  assert.equal(afterExit.remaining, 1);

  // Editing student info does not change residence
  updateStudentInfo(db, sup1, s1.id, { city: 'تهران' });
  const detail = getStudentDetail(db, sup1, s1.id);
  assert.equal(detail.student.city, 'تهران');
  assert.equal(detail.student.status, 'انصراف از خوابگاه');
  db.close();
});

test('deleting a room is admin-only, blocks active residents, and archives history', () => {
  const { db, admin, sup1, sup2 } = setupTestDb();
  const room = createRoom(db, sup1, { roomNumber: '301', capacity: 3 });
  const otherRoom = createRoom(db, sup1, { roomNumber: '302', capacity: 2 });

  const s1 = registerStudent(db, sup1, {
    firstName: 'حسن',
    lastName: 'اول',
    studentNumber: '40430001',
    entryTerm: ENTRY_TERMS[0],
    mobile: '09153330001',
    roomId: room.id,
  });
  registerStudent(db, sup1, {
    firstName: 'حسین',
    lastName: 'دوم',
    studentNumber: '40430002',
    entryTerm: ENTRY_TERMS[0],
    mobile: '09153330002',
    roomId: room.id,
  });
  const movedStudent = registerStudent(db, sup1, {
    firstName: 'رضا',
    lastName: 'سوم',
    studentNumber: '40430003',
    entryTerm: ENTRY_TERMS[0],
    mobile: '09153330003',
    roomId: room.id,
  });
  moveStudentInternal(db, sup1, {
    studentId: movedStudent.id,
    toRoomId: otherRoom.id,
    reason: 'جابه‌جایی آزمایشی برای بررسی حفظ سابقه',
  });

  // حذف فقط توسط مسئول کل
  assert.throws(
    () => deleteRoom(db, sup1, room.id),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 403
  );
  assert.throws(
    () => deleteRoom(db, sup2, room.id),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 403
  );

  // اتاق دارای ساکن قابل حذف نیست (هیچ دانشجویی حذف نمی‌شود)
  assert.throws(
    () => deleteRoom(db, admin, room.id),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 409
  );

  changeStudentStatus(db, sup1, s1.id, 'انصراف از خوابگاه', 'تخلیه اتاق برای آزمایش');
  const remaining = listStudents(db, admin).filter((s) => s.currentRoomId === room.id);
  for (const s of remaining) {
    changeStudentStatus(db, sup1, s.id, 'انصراف از خوابگاه', 'تخلیه اتاق برای آزمایش');
  }

  const result = deleteRoom(db, admin, room.id);
  assert.equal(result.archived, true);
  assert.equal(result.deletedStudents, 0);
  assert.equal(listRooms(db, admin).some((r) => r.id === room.id), false);
  assert.throws(
    () => getRoomDetail(db, admin, room.id),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 404
  );

  // سابقه دانشجویان حفظ می‌شود و شماره اتاق آزاد می‌شود.
  assert.ok(listStudents(db, admin).some((s) => s.id === movedStudent.id));
  assert.ok(
    (db.prepare('SELECT COUNT(*) c FROM student_residences WHERE room_id = ?').get(room.id) as { c: number }).c > 0
  );
  const recreated = createRoom(db, sup1, { roomNumber: '301', capacity: 2 });
  assert.notEqual(recreated.id, room.id);

  // اتاق بدون هیچ سابقه‌ای به‌صورت فیزیکی حذف می‌شود.
  const unused = createRoom(db, sup1, { roomNumber: '399', capacity: 1 });
  const hardDeleted = deleteRoom(db, admin, unused.id);
  assert.equal(hardDeleted.archived, false);
  assert.equal(listRooms(db, admin).some((r) => r.id === unused.id), false);
  db.close();
});

test('audit log hash chain detects tampering and records failed logins', () => {
  const { db, admin } = setupTestDb();
  const before = verifyAuditChain(db);
  assert.equal(before.ok, true);

  assert.throws(
    () => authenticateUser(db, 'admin', 'definitely-wrong-password'),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 401
  );

  const after = verifyAuditChain(db);
  assert.equal(after.ok, true);
  assert.ok(after.checked >= before.checked + 1);

  const failedLogin = db
    .prepare("SELECT details FROM audit_logs WHERE action = 'ورود ناموفق به سامانه' ORDER BY id DESC LIMIT 1")
    .get() as { details: string } | undefined;
  assert.ok(failedLogin);

  // دستکاری مستقیم یک رکورد باید توسط زنجیره هش شناسایی شود.
  const last = db.prepare('SELECT id, details FROM audit_logs ORDER BY id DESC LIMIT 1').get() as {
    id: number;
    details: string;
  };
  db.prepare('UPDATE audit_logs SET details = ? WHERE id = ?').run(
    `${last.details} (tampered)`,
    last.id
  );
  const tampered = verifyAuditChain(db);
  assert.equal(tampered.ok, false);
  assert.equal(tampered.brokenAt, last.id);
  assert.ok(listAuditLogs(db, admin).length > 0);
  db.close();
});

test('cross-dorm history no longer grants access to another dorm student', () => {
  const { db, admin, sup1, sup2 } = setupTestDb();
  const r1 = createRoom(db, sup1, { roomNumber: '801', capacity: 2 });
  const r2 = createRoom(db, sup2, { roomNumber: '802', capacity: 2 });
  const student = registerStudent(db, sup1, {
    firstName: 'نیما',
    lastName: 'بهرامی',
    studentNumber: '40480001',
    mobile: '09158000001',
    roomId: r1.id,
  });

  // انتقال کامل به خوابگاه دوم
  const transfer = createTransferRequest(db, admin, {
    studentId: student.id,
    toDormId: sup2.dormId!,
    toRoomId: r2.id,
    reason: 'انتقال آزمایشی بین خوابگاه‌ها',
    execute: true,
  });
  assert.equal(transfer.status, 'تأییدشده');

  assert.throws(
    () => getStudentDetail(db, sup1, student.id),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 403
  );

  const lookup = lookupStudentByNumber(db, sup1, '40480001');
  assert.equal(lookup.exists, true);
  if (lookup.exists) {
    assert.equal(lookup.canEdit, false);
    assert.equal(lookup.inOtherDorm, true);
    assert.equal((lookup.student as { mobile?: string }).mobile, undefined);
  }
  db.close();
});

test('national code uniqueness and password policy are enforced', () => {
  const { db, admin, sup1 } = setupTestDb();
  const room = createRoom(db, sup1, { roomNumber: '901', capacity: 4 });
  registerStudent(db, sup1, {
    firstName: 'علی',
    lastName: 'یک',
    studentNumber: '40490001',
    nationalCode: '0012345678',
    mobile: '09159000001',
    roomId: room.id,
  });
  assert.throws(
    () =>
      registerStudent(db, sup1, {
        firstName: 'علی',
        lastName: 'دو',
        studentNumber: '40490002',
        nationalCode: '0012345678',
        mobile: '09159000002',
        roomId: room.id,
      }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 409
  );

  // تصویر دانشجو فقط Data URL معتبر می‌پذیرد
  assert.throws(
    () =>
      registerStudent(db, sup1, {
        firstName: 'رضا',
        lastName: 'سه',
        studentNumber: '40490003',
        mobile: '09159000003',
        photoUrl: 'javascript:alert(1)',
        roomId: room.id,
      }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 400
  );

  assert.throws(
    () => createUser(db, admin, {
      username: 'weakuser',
      password: '123456',
      fullName: 'کاربر ضعیف',
      role: 'supervisor',
      dormId: sup1.dormId,
    }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 400
  );
  db.close();
});

test('internal movement updates active residence and keeps history', () => {
  const { db, sup1 } = setupTestDb();
  const r1 = createRoom(db, sup1, { roomNumber: '301', capacity: 2 });
  const r2 = createRoom(db, sup1, { roomNumber: '302', capacity: 2 });

  const s = registerStudent(db, sup1, {
    firstName: 'سجاد',
    lastName: 'باقری',
    studentNumber: '40430001',
    city: 'کاشمر',
    entryTerm: ENTRY_TERMS[0],
    semester: 3,
    degree: 'کاردانی',
    major: 'الکترونیک',
    mobile: '09153330001',
    roomId: r1.id,
  });

  const moved = moveStudentInternal(db, sup1, {
    studentId: s.id,
    toRoomId: r2.id,
    reason: 'درخواست دانشجو برای هم‌اتاقی جدید',
  });

  assert.equal(moved.student.currentRoomId, r2.id);
  assert.equal(moved.residences.filter((r) => r.isActive).length, 1);
  assert.equal(moved.residences.filter((r) => !r.isActive).length, 1);
  assert.equal(moved.movements.length, 2);

  const rooms = listRooms(db, sup1);
  assert.equal(rooms.find((r) => r.id === r1.id)!.occupied, 0);
  assert.equal(rooms.find((r) => r.id === r2.id)!.occupied, 1);
  db.close();
});

test('supervisors submit transfer requests and the destination supervisor approves them', () => {
  const { db, admin, sup1, sup2 } = setupTestDb();
  const r1 = createRoom(db, sup1, { roomNumber: '401', capacity: 2 });
  const r2 = createRoom(db, sup2, { roomNumber: '402', capacity: 1 });

  const s = registerStudent(db, sup1, {
    firstName: 'پویا',
    lastName: 'زارع',
    studentNumber: '40440001',
    city: 'نیشابور',
    entryTerm: ENTRY_TERMS[1],
    semester: 2,
    degree: 'کارشناسی',
    major: 'مکانیک',
    mobile: '09154440001',
    roomId: r1.id,
  });

  // سرپرست فقط درخواست ثبت می‌کند (بدون انتخاب اتاق مقصد)
  const request = createTransferRequest(db, sup1, {
    studentId: s.id,
    toDormId: sup2.dormId!,
    reason: 'تغییر رشته',
  });
  assert.equal(request.status, 'در انتظار تأیید');
  assert.equal(request.toRoomId, null);

  // سرپرست مبدأ نمی‌تواند درخواست را تأیید کند
  assert.throws(
    () => reviewTransferRequest(db, sup1, request.id, 'approve', undefined, r2.id),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 403
  );

  // سرپرست خوابگاه مقصد اتاق را به‌صورت دستی انتخاب و انتقال را تأیید می‌کند
  const approved = reviewTransferRequest(db, sup2, request.id, 'approve', undefined, r2.id);
  assert.equal(approved.status, 'تأییدشده');
  assert.equal(approved.toRoomId, r2.id);


  const detail = getStudentDetail(db, admin, s.id);
  assert.equal(detail.student.currentDormId, sup2.dormId);
  assert.equal(detail.student.currentRoomId, r2.id);

  const allRooms = listRooms(db, admin);
  assert.equal(allRooms.find((r) => r.id === r1.id)!.occupied, 0);
  assert.equal(allRooms.find((r) => r.id === r2.id)!.occupied, 1);

  // انتقال مستقیم توسط مسئول کل (بدون درخواست در انتظار)
  const r1b = createRoom(db, sup1, { roomNumber: '403', capacity: 2 });
  const direct = createTransferRequest(db, admin, {
    studentId: s.id,
    toDormId: sup1.dormId!,
    toRoomId: r1b.id,
    reason: 'بازگشت مستقیم',
    execute: true,
  });
  assert.equal(direct.status, 'تأییدشده');
  assert.equal(getStudentDetail(db, admin, s.id).student.currentDormId, sup1.dormId);

  // رد درخواست توسط سرپرست خوابگاه مقصد
  const req2 = createTransferRequest(db, sup1, {
    studentId: s.id,
    toDormId: sup2.dormId!,
    reason: 'درخواست مجدد',
  });
  const rejected = reviewTransferRequest(db, sup2, req2.id, 'reject', 'عدم تطابق پرونده');
  assert.equal(rejected.status, 'ردشده');

  // لغو درخواست توسط همان سرپرست
  const req3 = createTransferRequest(db, sup1, {
    studentId: s.id,
    toDormId: sup2.dormId!,
    reason: 'تست لغو',
  });
  const cancelled = cancelTransferRequest(db, sup1, req3.id);
  assert.equal(cancelled.status, 'لغوشده');
  db.close();
});

test('supervisor cannot access or edit other dorm room or student', () => {
  const { db, sup1, sup2 } = setupTestDb();
  const r2 = createRoom(db, sup2, { roomNumber: '501', capacity: 2 });
  const s2 = registerStudent(db, sup2, {
    firstName: 'یاسین',
    lastName: 'مرادی',
    studentNumber: '40450001',
    city: 'فریمان',
    entryTerm: ENTRY_TERMS[0],
    semester: 4,
    degree: 'کاردانی',
    major: 'باغبانی',
    mobile: '09155550001',
    roomId: r2.id,
  });

  assert.throws(
    () => listRooms(db, sup1, { dormId: sup2.dormId! }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 403
  );
  assert.throws(
    () => getStudentDetail(db, sup1, s2.id),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 403
  );
  assert.throws(
    () => updateStudentInfo(db, sup1, s2.id, { city: 'مشهد' }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 403
  );
  assert.throws(
    () => listAuditLogs(db, sup1, { dormId: sup2.dormId! }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 403
  );
  assert.throws(
    () => listMovements(db, sup1, { dormId: sup2.dormId! }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 403
  );
  db.close();
});

test('student detail includes transfer history, exit report returns exited students, and admin user management works', () => {
  const { db, admin, sup1, sup2 } = setupTestDb();
  const r1 = createRoom(db, sup1, { roomNumber: '601', capacity: 2 });
  const r2 = createRoom(db, sup2, { roomNumber: '602', capacity: 2 });

  const s = registerStudent(db, sup1, {
    firstName: 'فرهاد',
    lastName: 'اکبری',
    studentNumber: '40460001',
    city: 'نیشابور',
    entryTerm: ENTRY_TERMS[0],
    semester: 2,
    degree: 'کارشناسی',
    major: 'نرم‌افزار',
    mobile: '09156660001',
    roomId: r1.id,
  });

  const tr = createTransferRequest(db, admin, {
    studentId: s.id,
    toDormId: sup2.dormId!,
    toRoomId: r2.id,
    reason: 'انتقال موردی',
  });
  reviewTransferRequest(db, admin, tr.id, 'approve');

  const detail = getStudentDetail(db, admin, s.id);
  assert.equal(detail.transfers.length, 1);
  assert.equal(detail.transfers[0].status, 'تأییدشده');

  changeStudentStatus(db, sup2, s.id, 'فارغ‌التحصیل', 'پایان دوره کارشناسی');

  const adminExits = listExitRecords(db, admin);
  assert.equal(adminExits.length, 1);
  assert.equal(adminExits[0].studentNumber, '40460001');
  assert.equal(adminExits[0].exitReason, 'پایان دوره کارشناسی');

  const sup1Exits = listExitRecords(db, sup1);
  assert.equal(sup1Exits.length, 0);

  const users = listUsers(db, admin);
  assert.ok(users[0].createdAt);
  const logs = listAuditLogs(db, admin, { role: 'supervisor' });
  assert.ok(logs.every((l) => l.actorRole === 'supervisor'));

  assert.throws(
    () => updateUser(db, sup1, sup2.id, { fullName: 'تغییر غیرمجاز' }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 403
  );
  db.close();
});

test('users can update their own display name and profile photo', () => {
  const { db, sup1 } = setupTestDb();
  const updated = updateOwnProfile(db, sup1, {
    fullName: 'سرپرست نمونه',
    photoUrl: 'data:image/png;base64,iVBORw0KGgo=',
  });
  assert.equal(updated.fullName, 'سرپرست نمونه');
  assert.equal(updated.photoUrl, 'data:image/png;base64,iVBORw0KGgo=');

  const cleared = updateOwnProfile(db, updated, { photoUrl: '' });
  assert.equal(cleared.photoUrl, null);

  assert.throws(
    () => updateOwnProfile(db, sup1, { fullName: 'ا', photoUrl: '' }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 400
  );
  assert.throws(
    () => updateOwnProfile(db, sup1, { fullName: 'نام معتبر', photoUrl: 'https://example.com/a.png' }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 400
  );
  db.close();
});

test('extra capacity rooms accept additional students without consuming normal beds', () => {
  const { db, sup1 } = setupTestDb();
  const room = createRoom(db, sup1, {
    roomNumber: '701',
    capacity: 1,
    extraCapacity: 2,
  });
  assert.equal(room.extraCapacity, 2);

  const baseStudent = registerStudent(db, sup1, {
    firstName: 'میلاد',
    lastName: 'کریمی',
    studentNumber: '40470001',
    nationalCode: '0012345678',
    guardianPhone: '09121110001',
    mobile: '09151110001',
    roomId: room.id,
  });
  assert.equal(baseStudent.isExtraCapacity, false);

  assert.throws(
    () =>
      registerStudent(db, sup1, {
        firstName: 'فرزاد',
        lastName: 'نوری',
        studentNumber: '40470002',
        mobile: '09151110002',
        roomId: room.id,
      }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 400
  );

  const extraStudent = registerStudent(db, sup1, {
    firstName: 'فرزاد',
    lastName: 'نوری',
    studentNumber: '40470002',
    guardianPhone: '09121110002',
    mobile: '09151110002',
    roomId: room.id,
    isExtraCapacity: true,
  });
  assert.equal(extraStudent.isExtraCapacity, true);

  const updated = listRooms(db, sup1).find((r) => r.id === room.id)!;
  assert.equal(updated.baseOccupied, 1);
  assert.equal(updated.extraOccupied, 1);
  assert.equal(updated.extraRemaining, 1);
  assert.equal(updated.remaining, 0);
  assert.equal(updated.occupied, 2);

  // جست‌وجوی دانشجو با کد ملی و شماره ولی
  const byNationalCode = listStudents(db, sup1, { search: '0012345678' });
  assert.equal(byNationalCode.length, 1);
  assert.equal(byNationalCode[0].studentNumber, '40470001');
  db.close();
});
