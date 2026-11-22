import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRoomMetrics,
  validateStudentInput,
  canAssignToRoom,
  canReduceRoomCapacity,
  canDeactivateRoom,
  canUserAccessDorm,
  canUserManageTransfer,
  toEnglishDigits,
  toPersianDigits,
  getPathForTab,
  getTabForPath,
  isTabAllowedForRole,
  filterByDateRange,
  buildEntryTerms,
  getCurrentShamsiYear,
  getEntryTerms,
  getEntryTermMonth,
  sortEntryTerms,
  ENTRY_TERMS,
} from './dormRules';

test('computeRoomMetrics calculates remaining capacity, percent, and status', () => {
  const partial = computeRoomMetrics(6, 4);
  assert.equal(partial.remaining, 2);
  assert.equal(partial.occupancyPercent, 67);
  assert.equal(partial.status, 'available');

  const full = computeRoomMetrics(4, 4);
  assert.equal(full.remaining, 0);
  assert.equal(full.occupancyPercent, 100);
  assert.equal(full.status, 'full');

  const empty = computeRoomMetrics(5, 0);
  assert.equal(empty.remaining, 5);
  assert.equal(empty.occupancyPercent, 0);
  assert.equal(empty.status, 'empty');
});

test('validateStudentInput validates required fields and preserves leading zero in mobile', () => {
  const validResult = validateStudentInput({
    firstName: 'علی',
    lastName: 'محمدی',
    studentNumber: '۴۰۱۲۳۴۵۶۷',
    city: 'نیشابور',
    entryTerm: ENTRY_TERMS[0],
    semester: 3,
    degree: 'کارشناسی',
    major: 'مهندسی نرم‌افزار',
    mobile: '۰۹۱۵۱۲۳۴۵۶۷',
  });

  assert.equal(validResult.valid, true);
  assert.equal(validResult.normalized.studentNumber, '401234567');
  assert.equal(validResult.normalized.mobile, '09151234567');
  assert.equal(validResult.normalized.mobile.startsWith('0'), true);

  const invalidResult = validateStudentInput({
    firstName: 'ا',
    lastName: '',
    studentNumber: 'abc',
    city: '',
    entryTerm: 'تابستان' as never,
    semester: 0,
    degree: 'دکتری' as never,
    major: '',
    mobile: '9151234567',
  });

  assert.equal(invalidResult.valid, false);
  assert.ok(invalidResult.errors.firstName);
  assert.ok(invalidResult.errors.lastName);
  assert.ok(invalidResult.errors.studentNumber);
  assert.ok(invalidResult.errors.entryTerm);
  assert.ok(invalidResult.errors.semester);
  assert.ok(invalidResult.errors.degree);
  assert.ok(invalidResult.errors.mobile);
});

test('entry terms are generated from the current Persian year and shift automatically', () => {
  assert.deepEqual(buildEntryTerms(1405), [
    '405-مهر',
    '405-بهمن',
    '404-مهر',
    '404-بهمن',
    '403-مهر',
    '403-بهمن',
    '402-مهر',
    '402-بهمن',
  ]);

  const nextYear = buildEntryTerms(1406);
  assert.equal(nextYear[0], '406-مهر');
  assert.equal(nextYear[1], '406-بهمن');
  assert.equal(nextYear.includes('402-مهر'), false);
  assert.equal(nextYear.includes('402-بهمن'), false);
  assert.equal(nextYear.length, 8);

  const nowruz = new Date('2027-03-21T12:00:00Z');
  assert.equal(getCurrentShamsiYear(nowruz), 1406);
  assert.equal(getEntryTerms(nowruz)[0], '406-مهر');

  assert.equal(getEntryTermMonth('405-مهر'), 'مهر');
  assert.equal(getEntryTermMonth('404-بهمن'), 'بهمن');
  assert.equal(getEntryTermMonth('مهر'), 'مهر');
  assert.equal(getEntryTermMonth(null), null);

  assert.deepEqual(sortEntryTerms(['402-بهمن', '405-مهر', '404-مهر', '405-بهمن']), [
    '405-مهر',
    '405-بهمن',
    '404-مهر',
    '402-بهمن',
  ]);
});

test('validateStudentInput only accepts year-based entry terms', () => {
  const base = {
    firstName: 'علی',
    lastName: 'محمدی',
    studentNumber: '401234567',
    mobile: '09151234567',
  };
  assert.equal(validateStudentInput({ ...base, entryTerm: '405-مهر' }).valid, true);
  assert.equal(validateStudentInput({ ...base, entryTerm: '۴۰۵-بهمن' }).valid, true);
  assert.equal(validateStudentInput({ ...base, entryTerm: 'مهر' }).valid, false);
  assert.equal(validateStudentInput({ ...base, entryTerm: '405' }).valid, false);
});

test('canAssignToRoom blocks full, inactive, and cross-dorm rooms', () => {
  assert.equal(
    canAssignToRoom({ isActive: true, capacity: 4, occupied: 3, dormId: 1 }, 1).allowed,
    true
  );
  assert.equal(
    canAssignToRoom({ isActive: true, capacity: 4, occupied: 4, dormId: 1 }, 1).allowed,
    false
  );
  assert.equal(
    canAssignToRoom({ isActive: false, capacity: 4, occupied: 0, dormId: 1 }, 1).allowed,
    false
  );
  assert.equal(
    canAssignToRoom({ isActive: true, capacity: 4, occupied: 0, dormId: 2 }, 1).allowed,
    false
  );
});

test('canReduceRoomCapacity and canDeactivateRoom enforce resident safety', () => {
  assert.equal(canReduceRoomCapacity(3, 4).allowed, false);
  assert.equal(canReduceRoomCapacity(0, 0).allowed, false);
  assert.equal(canReduceRoomCapacity(4, 4).allowed, true);
  assert.equal(canDeactivateRoom(1).allowed, false);
  assert.equal(canDeactivateRoom(0).allowed, true);
});

test('RBAC helpers isolate supervisor dorm access and transfer approvals', () => {
  const admin = { role: 'admin' as const, dormId: null };
  const sup1 = { role: 'supervisor' as const, dormId: 1 };
  const sup2 = { role: 'supervisor' as const, dormId: 2 };

  assert.equal(canUserAccessDorm(admin, 1), true);
  assert.equal(canUserAccessDorm(admin, 2), true);
  assert.equal(canUserAccessDorm(sup1, 1), true);
  assert.equal(canUserAccessDorm(sup1, 2), false);

  assert.equal(canUserManageTransfer(admin, 'create'), true);
  assert.equal(canUserManageTransfer(sup1, 'create'), true);
  assert.equal(canUserManageTransfer(admin, 'cancel'), true);
  assert.equal(canUserManageTransfer(sup2, 'cancel'), true);
  assert.equal(canUserManageTransfer(sup2, 'approve', 2), true);
  assert.equal(canUserManageTransfer(sup1, 'approve', 2), false);
  assert.equal(canUserManageTransfer(sup1, 'reject', 1), true);
  assert.equal(canUserManageTransfer(sup2, 'reject', 1), false);
  assert.equal(canUserManageTransfer(admin, 'approve', 2), true);
});

test('validateStudentInput keeps optional academic fields optional (city/entry/term/degree/major)', () => {
  const result = validateStudentInput({
    firstName: 'رضا',
    lastName: 'کریمی',
    studentNumber: '401234567',
    mobile: '09151234567',
  });
  assert.equal(result.valid, true);
  assert.equal(result.normalized.city, '');
  assert.equal(result.normalized.entryTerm, null);
  assert.equal(result.normalized.semester, null);
  assert.equal(result.normalized.degree, null);
  assert.equal(result.normalized.major, '');

  const outOfRange = validateStudentInput({
    firstName: 'رضا',
    lastName: 'کریمی',
    studentNumber: '401234567',
    mobile: '09151234567',
    semester: 10,
  });
  assert.equal(outOfRange.valid, false);
  assert.ok(outOfRange.errors.semester);
});

test('digit conversion helpers convert between Persian and English numerals', () => {
  assert.equal(toPersianDigits('1404/05/25'), '۱۴۰۴/۰۵/۲۵');
  assert.equal(toEnglishDigits('۰۹۱۵۱۲۳۴۵۶۷'), '09151234567');
});

test('route helpers map tabs/URLs and enforce admin-only routes', () => {
  assert.equal(getPathForTab('dashboard'), '/');
  assert.equal(getPathForTab('users'), '/users');
  assert.equal(getTabForPath('/backups/'), 'backups');
  assert.equal(getTabForPath('/dashboard'), 'dashboard');
  assert.equal(isTabAllowedForRole('users', 'admin'), true);
  assert.equal(isTabAllowedForRole('users', 'supervisor'), false);
  assert.equal(isTabAllowedForRole('dormitories', 'supervisor'), false);
  assert.equal(isTabAllowedForRole('backups', 'supervisor'), false);
  assert.equal(isTabAllowedForRole('transfers', 'supervisor'), true);
});

test('filterByDateRange filters ISO timestamps cleanly', () => {
  const items = [
    { id: 1, dt: '2025-08-10 10:00:00' },
    { id: 2, dt: '2025-08-15T14:30:00Z' },
    { id: 3, dt: '2025-08-20 09:00:00' },
  ];
  const res = filterByDateRange(items, (i) => i.dt, '2025-08-12', '2025-08-18');
  assert.deepEqual(res.map((r) => r.id), [2]);
});


test('extra capacity is tracked separately from base beds', () => {
  const metrics = computeRoomMetrics(4, 5, 2, 1);
  assert.equal(metrics.baseOccupied, 4);
  assert.equal(metrics.remaining, 0);
  assert.equal(metrics.extraCapacity, 2);
  assert.equal(metrics.extraOccupied, 1);
  assert.equal(metrics.extraRemaining, 1);

  assert.equal(
    canAssignToRoom(
      { isActive: true, capacity: 4, occupied: 5, extraCapacity: 2, extraOccupied: 1, dormId: 1 },
      1
    ).allowed,
    false
  );
  assert.equal(
    canAssignToRoom(
      { isActive: true, capacity: 4, occupied: 5, extraCapacity: 2, extraOccupied: 1, dormId: 1 },
      1,
      { isExtraCapacity: true }
    ).allowed,
    true
  );
  assert.equal(
    canAssignToRoom(
      { isActive: true, capacity: 4, occupied: 5, extraCapacity: 2, extraOccupied: 1, dormId: 1 },
      1,
      { isExtraCapacity: false }
    ).allowed,
    false
  );
});

test('student profile validates optional national code and guardian phone', () => {
  const valid = validateStudentInput({
    firstName: 'سارا',
    lastName: 'احمدی',
    studentNumber: '40471234',
    nationalCode: '۰۰۱۲۳۴۵۶۷۸',
    guardianPhone: '۰۹۱۲۱۲۳۴۵۶۷',
    mobile: '09151234567',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.normalized.nationalCode, '0012345678');
  assert.equal(valid.normalized.guardianPhone, '09121234567');

  const invalid = validateStudentInput({
    firstName: 'سارا',
    lastName: 'احمدی',
    studentNumber: '40471234',
    nationalCode: '123',
    guardianPhone: '123',
    mobile: '09151234567',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.nationalCode);
  assert.ok(invalid.errors.guardianPhone);
});
