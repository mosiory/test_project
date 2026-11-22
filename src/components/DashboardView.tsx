import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  BedDouble,
  Building2,
  ChevronLeft,
  Clock,
  Edit3,
  Eye,
  FileText,
  History,
  PieChart,
  Plus,
  Sprout,
  UserMinus,
  Users,
} from 'lucide-react';
import {
  type AuthUser,
  type AuditLogRecord,
  type Dormitory,
  type NavTab,
  type TransferRequestRecord,
  formatShamsiDate,
  toPersianDigits,
} from '../shared/dormRules';
import { DonutGauge } from './ui/DonutGauge';
import { Modal } from './ui/Modal';
import { StatusBadge } from './ui/StatusBadge';
import campusBanner from '../assets/images/campus_dorm_banner_1794735771856.jpg';

export interface DashboardPayload {
  dorms: Dormitory[];
  summary: {
    totalOccupied: number;
    totalCapacity: number;
    remainingCapacity: number;
    occupancyPercent: number;
    totalActiveRooms: number;
    fullRoomsCount: number;
    availableRoomsCount: number;
    emptyRoomsCount: number;
    extraCapacity: number;
    extraOccupied: number;
    extraRemaining: number;
    extraOccupancyPercent: number;
    extraStudentsPercent: number;
    extraRoomsCount: number;
    inactiveStudentsCount: number;
    movementsCount: number;
    pendingTransfersCount: number;
  };
  charts: {
    byDegree: { کارشناسی: number; کاردانی: number };
    byEntry: { مهر: number; بهمن: number };
    byMajor: Array<{ major: string; count: number }>;
  };
  pendingTransfers: TransferRequestRecord[];
  recentLogs: AuditLogRecord[];
}

interface DashboardViewProps {
  user: AuthUser;
  data: DashboardPayload;
  onNavigate: (tab: NavTab, options?: { dormId?: number; roomFilter?: string }) => void;
}

function getActionIcon(action: string) {
  if (action.includes('ثبت') || action.includes('ایجاد')) {
    return <Plus className="w-4 h-4 text-emerald-600" />;
  }
  if (action.includes('جابه‌جایی') || action.includes('انتقال')) {
    return <ArrowLeftRight className="w-4 h-4 text-blue-600" />;
  }
  if (action.includes('ورود') || action.includes('خروج')) {
    return <History className="w-4 h-4 text-indigo-600" />;
  }
  return <Edit3 className="w-4 h-4 text-amber-600" />;
}

export function DashboardView({ user, data, onNavigate }: DashboardViewProps) {
  const { dorms, summary, charts, pendingTransfers, recentLogs } = data;
  const isAdmin = user.role === 'admin';
  const [selectedTransfer, setSelectedTransfer] = useState<TransferRequestRecord | null>(null);

  const fanavariDorm = dorms.find((d) => d.code === 'fanavari') ?? dorms[0];
  const maharatDorm = dorms.find((d) => d.code === 'maharat') ?? dorms[1];

  // در بنر پنل سرپرست، نام پردیس همراه با عنوان خوابگاه در پرانتز نمایش داده می‌شود.
  const supervisorDormCode = dorms.find((d) => d.id === user.dormId)?.code;
  const dormCitySuffix = supervisorDormCode === 'maharat' ? ' نیشابور' : '';
  const supervisorDormLine = `${user.dormName ?? ''} (${user.dormSubtitle ?? ''}${dormCitySuffix})`;

  return (
    <div className="space-y-5">
      {/* Hero Welcome Banner */}
      <section className="relative bg-gradient-to-l from-[#E8F1FF] via-[#F4F8FF] to-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden min-h-[112px] md:min-h-[144px] flex items-center">
        {/* متن در نیمهٔ راست و وسط فضای خالی (۴۴٪ سمت راست سکشن) قرار می‌گیرد */}
        <div className="relative z-10 w-full max-w-xl px-5 sm:px-6 lg:px-8 py-5 md:py-6 md:w-[44%] md:max-w-none md:text-center">
          <h1
            className="text-lg sm:text-xl lg:text-2xl font-extrabold text-slate-900 leading-snug"
            style={{ textWrap: 'balance' }}
          >
            {isAdmin ? 'داشبورد مدیریت خوابگاه' : 'به معاونت فرهنگی و دانشجویی خوش آمدید'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1.5 font-medium">
            {isAdmin ? (
              <>
                <span className="block">به معاونت فرهنگی و دانشجویی خوش آمدید</span>
                <span className="block">مدیریت هوشمند و یکپارچه خوابگاه‌های دانشگاه</span>
              </>
            ) : (
              supervisorDormLine
            )}
          </p>
        </div>

        {/* Left Campus Architectural Visual smoothly blended */}
        <div
          className="hidden md:block absolute inset-y-0 left-0 w-[56%] pointer-events-none"
          style={{
            WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)',
            maskImage: 'linear-gradient(to right, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)',
          }}
        >
          <img
            src={campusBanner}
            alt="محوطه خوابگاه دانشگاه"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center"
          />
        </div>
      </section>

      {/* Top KPI Cards */}
      {isAdmin ? (
        <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-gradient-to-l from-[#F3F4FF] to-white rounded-2xl border border-indigo-200/70 shadow-xs px-4 sm:px-5 py-4 flex items-center justify-between gap-2">
            <div className="text-right min-w-0">
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums leading-none">
                {toPersianDigits(summary.totalOccupied)}
              </div>
              <div className="text-[11px] sm:text-xs font-semibold text-slate-600 mt-2 leading-4">
                تعداد کل دانشجویان ساکن
              </div>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-indigo-100/80 text-indigo-600 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs px-4 sm:px-5 py-4 flex items-center justify-between gap-2">
            <div className="text-right min-w-0">
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums leading-none">
                {toPersianDigits(summary.totalCapacity)}
              </div>
              <div className="text-[11px] sm:text-xs font-semibold text-slate-600 mt-2 leading-4">
                ظرفیت کل دو خوابگاه
              </div>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
              <BedDouble className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>

          <div className="bg-gradient-to-l from-[#ECFDF5] to-[#F7FEFA] rounded-2xl border border-emerald-200/70 shadow-xs px-4 sm:px-5 py-4 flex items-center justify-between gap-2">
            <div className="text-right min-w-0">
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 tabular-nums leading-none">
                {toPersianDigits(summary.remainingCapacity)}
              </div>
              <div className="text-[11px] sm:text-xs font-semibold text-slate-600 mt-2 leading-4">
                تعداد ظرفیت خالی
              </div>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-100/80 text-emerald-600 flex items-center justify-center shrink-0">
              <PieChart className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-amber-200/80 shadow-xs px-4 sm:px-5 py-4 flex items-center justify-between gap-2">
            <div className="text-right min-w-0">
              <div className="text-2xl sm:text-3xl font-extrabold text-amber-700 tabular-nums leading-none">
                {toPersianDigits(summary.inactiveStudentsCount)}
              </div>
              <div className="text-[11px] sm:text-xs font-semibold text-slate-600 mt-2 leading-4">
                تعداد دانشجویان غیرفعال
              </div>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <UserMinus className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-3 gap-3 sm:gap-5">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-right">
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums leading-none">
                {toPersianDigits(summary.occupancyPercent)}٪
              </div>
              <div className="text-[11px] sm:text-sm font-medium text-slate-600 mt-2">میزان اشغال کل</div>
            </div>
            <div className="hidden sm:flex w-13 h-13 rounded-2xl bg-blue-50 text-[#2563EB] items-center justify-center shrink-0">
              <PieChart className="w-7 h-7" />
            </div>
          </div>

          <div className="bg-gradient-to-l from-[#ECFDF5] to-[#F7FEFA] rounded-2xl border border-emerald-200/70 shadow-xs px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-right">
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums leading-none">
                {toPersianDigits(summary.remainingCapacity)}
              </div>
              <div className="text-[11px] sm:text-sm font-medium text-slate-600 mt-2">ظرفیت باقی‌مانده</div>
            </div>
            <div className="hidden sm:flex w-13 h-13 rounded-2xl bg-emerald-100/80 text-emerald-600 items-center justify-center shrink-0">
              <BedDouble className="w-7 h-7" />
            </div>
          </div>

          <div className="bg-gradient-to-l from-[#F3F4FF] to-white rounded-2xl border border-indigo-200/70 shadow-xs px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-right">
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums leading-none">
                {toPersianDigits(summary.totalOccupied)}
              </div>
              <div className="text-[11px] sm:text-sm font-medium text-slate-600 mt-2">کل دانشجویان ساکن</div>
            </div>
            <div className="hidden sm:flex w-13 h-13 rounded-2xl bg-indigo-100/80 text-indigo-600 items-center justify-center shrink-0">
              <Users className="w-7 h-7" />
            </div>
          </div>
        </section>
      )}

      {/* آمار ظرفیت مازاد */}
      <section className="bg-amber-50/60 rounded-2xl border border-amber-200/80 shadow-xs p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-bold text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>وضعیت ظرفیت مازاد خوابگاه‌ها</span>
          </h2>
          <span className="text-[11px] font-semibold text-amber-800">
            {toPersianDigits(summary.extraRoomsCount)} اتاق دارای ظرفیت مازاد
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-amber-200/70 px-3 py-2.5">
            <div className="text-xl font-extrabold text-amber-700 tabular-nums">
              {toPersianDigits(summary.extraCapacity)}
            </div>
            <div className="text-[11px] font-semibold text-slate-600 mt-1">کل ظرفیت مازاد</div>
          </div>
          <div className="bg-white rounded-xl border border-rose-200/70 px-3 py-2.5">
            <div className="text-xl font-extrabold text-rose-600 tabular-nums">
              {toPersianDigits(summary.extraOccupied)}
            </div>
            <div className="text-[11px] font-semibold text-slate-600 mt-1">
              ظرفیت مازاد پرشده
            </div>
          </div>
          <div className="bg-white rounded-xl border border-emerald-200/70 px-3 py-2.5">
            <div className="text-xl font-extrabold text-emerald-600 tabular-nums">
              {toPersianDigits(summary.extraRemaining)}
            </div>
            <div className="text-[11px] font-semibold text-slate-600 mt-1">ظرفیت مازاد خالی</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 px-3 py-2.5">
            <div className="text-xl font-extrabold text-slate-800 tabular-nums">
              {toPersianDigits(summary.extraStudentsPercent)}٪
            </div>
            <div className="text-[11px] font-semibold text-slate-600 mt-1">
              درصد دانشجویان مازاد
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              اشغال ظرفیت مازاد: {toPersianDigits(summary.extraOccupancyPercent)}٪
            </div>
          </div>
        </div>
      </section>

      {/* Role-Specific Middle Section */}
      {isAdmin ? (
        <>
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Dorm 1 Card: پردیس فناوری */}
            {fanavariDorm && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        خوابگاه {fanavariDorm.name}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">{fanavariDorm.subtitle}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('rooms', { dormId: fanavariDorm.id })}
                    aria-label={`مشاهده اتاق‌های ${fanavariDorm.name}`}
                    className="w-9 h-9 rounded-full border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
                  <div className="grid grid-cols-3 sm:grid-cols-1 gap-3 text-center">
                    <div>
                      <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
                        {toPersianDigits(fanavariDorm.occupiedCount)}
                      </div>
                      <div className="text-xs font-medium text-slate-500 mt-0.5">دانشجوی ساکن</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-slate-700 tabular-nums">
                        {toPersianDigits(fanavariDorm.totalCapacity)}
                      </div>
                      <div className="text-xs font-medium text-slate-500 mt-0.5">ظرفیت کل</div>
                    </div>
                    <div>
                      <div className="text-2xl font-extrabold text-emerald-600 tabular-nums">
                        {toPersianDigits(fanavariDorm.remainingCapacity)}
                      </div>
                      <div className="text-xs font-medium text-slate-500 mt-0.5">ظرفیت خالی</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-amber-700 tabular-nums">
                        {toPersianDigits(fanavariDorm.extraOccupied)} /{' '}
                        {toPersianDigits(fanavariDorm.extraCapacity)}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                        ظرفیت مازاد (پر/کل)
                      </div>
                    </div>
                  </div>

                  <div className="hidden sm:block h-28 w-px bg-slate-100" />

                  <DonutGauge percent={fanavariDorm.occupancyPercent} color="blue" />
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => onNavigate('students', { dormId: fanavariDorm.id })}
                    className="text-slate-600 hover:text-[#2563EB] font-semibold"
                  >
                    مشاهده دانشجویان
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('dormitories')}
                    className="text-[#2563EB] font-bold hover:underline"
                  >
                    جزئیات خوابگاه
                  </button>
                </div>
              </div>
            )}

            {/* Dorm 2 Card: پردیس مهارت */}
            {maharatDorm && (
              <div className="bg-gradient-to-b from-[#F0FDF7] to-white rounded-2xl border border-emerald-200/70 shadow-xs p-6 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-emerald-100/80 text-emerald-600 flex items-center justify-center shrink-0">
                      <Sprout className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        خوابگاه {maharatDorm.name}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">{maharatDorm.subtitle}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('rooms', { dormId: maharatDorm.id })}
                    aria-label={`مشاهده اتاق‌های ${maharatDorm.name}`}
                    className="w-9 h-9 rounded-full border border-emerald-200 bg-white hover:bg-emerald-50 flex items-center justify-center text-slate-600 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
                  <div className="grid grid-cols-3 sm:grid-cols-1 gap-3 text-center">
                    <div>
                      <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
                        {toPersianDigits(maharatDorm.occupiedCount)}
                      </div>
                      <div className="text-xs font-medium text-slate-500 mt-0.5">دانشجوی ساکن</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-slate-700 tabular-nums">
                        {toPersianDigits(maharatDorm.totalCapacity)}
                      </div>
                      <div className="text-xs font-medium text-slate-500 mt-0.5">ظرفیت کل</div>
                    </div>
                    <div>
                      <div className="text-2xl font-extrabold text-emerald-600 tabular-nums">
                        {toPersianDigits(maharatDorm.remainingCapacity)}
                      </div>
                      <div className="text-xs font-medium text-slate-500 mt-0.5">ظرفیت خالی</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-amber-700 tabular-nums">
                        {toPersianDigits(maharatDorm.extraOccupied)} /{' '}
                        {toPersianDigits(maharatDorm.extraCapacity)}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                        ظرفیت مازاد (پر/کل)
                      </div>
                    </div>
                  </div>

                  <div className="hidden sm:block h-28 w-px bg-emerald-100" />

                  <DonutGauge percent={maharatDorm.occupancyPercent} color="emerald" />
                </div>

                <div className="mt-4 pt-3 border-t border-emerald-100 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => onNavigate('students', { dormId: maharatDorm.id })}
                    className="text-slate-600 hover:text-emerald-700 font-semibold"
                  >
                    مشاهده دانشجویان
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('dormitories')}
                    className="text-emerald-700 font-bold hover:underline"
                  >
                    جزئیات خوابگاه
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Admin Occupancy Comparison Chart + Pending Transfer Requests */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Comparison Chart */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 bg-[#EEF4FF] border-b border-slate-200/70 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#2563EB]" />
                <h2 className="text-sm font-bold text-slate-800">مقایسه میزان اشغال دو خوابگاه</h2>
              </div>
              <div className="p-5 space-y-5 flex-1 flex flex-col justify-center">
                {dorms.map((d, idx) => (
                  <div key={d.id} className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-800">{d.name}</span>{' '}
                        <span className="text-slate-500">({d.subtitle})</span>
                      </div>
                      <span className="font-extrabold text-slate-900 tabular-nums">
                        {toPersianDigits(d.occupancyPercent)}٪ اشغال
                      </span>
                    </div>
                    <div className="h-4 rounded-xl bg-slate-100 overflow-hidden flex">
                      <div
                        className={`h-full transition-all ${
                          idx === 0 ? 'bg-[#2563EB]' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${d.occupancyPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 tabular-nums">
                      <span>ساکن: {toPersianDigits(d.occupiedCount)} نفر</span>
                      <span>خالی: {toPersianDigits(d.remainingCapacity)} نفر</span>
                      <span>ظرفیت کل: {toPersianDigits(d.totalCapacity)} نفر</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pending Transfer Requests Waiting Destination Supervisor */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 bg-[#EEF4FF] border-b border-slate-200/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="w-5 h-5 text-[#2563EB]" />
                  <h2 className="text-sm font-bold text-slate-800">
                    درخواست‌های انتقال در انتظار پاسخ سرپرست مقصد
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('transfers')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <span>مدیریت انتقال‌ها</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-4 flex-1">
                {pendingTransfers.length === 0 ? (
                  <div className="rounded-xl bg-[#F4F7FC] border border-slate-200/60 p-8 text-center">
                    <FileText className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-600">
                      درخواست انتقالی در انتظار بررسی وجود ندارد
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {pendingTransfers.map((t) => (
                      <div
                        key={t.id}
                        className="py-3 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 rounded-xl transition-colors"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                            <span>{t.studentName}</span>
                            <span className="num font-semibold text-slate-600">
                              ({toPersianDigits(t.studentNumber)})
                            </span>
                            <StatusBadge label={t.status} />
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>
                              از {t.fromDormName} (اتاق {toPersianDigits(t.fromRoomNumber)}) به{' '}
                              <strong className="text-blue-700">{t.toDormName}</strong> (اتاق{' '}
                              {toPersianDigits(t.toRoomNumber ?? '—')})
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedTransfer(t)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-blue-50 hover:text-[#2563EB] text-xs font-semibold text-slate-700 shrink-0"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>جزئیات درخواست</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Supervisor Room Status Card */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 bg-[#EEF4FF] border-b border-slate-200/70 flex items-center gap-2">
              <BedDouble className="w-5 h-5 text-[#2563EB]" />
              <h2 className="text-sm font-bold text-slate-800">وضعیت اتاق‌ها</h2>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1 items-center">
              <button
                type="button"
                onClick={() => onNavigate('rooms', { roomFilter: 'full' })}
                className="p-4 rounded-2xl bg-[#FEF2F2] border border-rose-200/60 hover:border-rose-300 text-right transition-colors flex flex-col justify-between min-h-[120px]"
              >
                <div className="text-xs font-bold text-slate-700">اتاق‌های پر ظرفیت</div>
                <div className="flex items-end justify-between mt-4">
                  <div>
                    <div className="text-3xl font-extrabold text-rose-600 tabular-nums leading-none">
                      {toPersianDigits(summary.fullRoomsCount)}
                    </div>
                    <div className="text-[11px] font-medium text-rose-500 mt-1">(تکمیل ظرفیت)</div>
                  </div>
                  <BedDouble className="w-6 h-6 text-rose-400" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('rooms', { roomFilter: 'available' })}
                className="p-4 rounded-2xl bg-[#EFF6FF] border border-blue-200/60 hover:border-blue-300 text-right transition-colors flex flex-col justify-between min-h-[120px]"
              >
                <div className="text-xs font-bold text-slate-700">اتاق‌های دارای ظرفیت</div>
                <div className="flex items-end justify-between mt-4">
                  <div className="text-3xl font-extrabold text-[#2563EB] tabular-nums leading-none">
                    {toPersianDigits(summary.availableRoomsCount)}
                  </div>
                  <BedDouble className="w-6 h-6 text-blue-500" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('rooms', { roomFilter: 'empty' })}
                className="p-4 rounded-2xl bg-[#ECFDF5] border border-emerald-200/60 hover:border-emerald-300 text-right transition-colors flex flex-col justify-between min-h-[120px]"
              >
                <div className="text-xs font-bold text-slate-700">اتاق‌های خالی</div>
                <div className="flex items-end justify-between mt-4">
                  <div className="text-3xl font-extrabold text-emerald-600 tabular-nums leading-none">
                    {toPersianDigits(summary.emptyRoomsCount)}
                  </div>
                  <BedDouble className="w-6 h-6 text-emerald-500" />
                </div>
              </button>
            </div>
          </div>

          {/* Supervisor Dormitory Occupancy Card */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 bg-[#EEF4FF] border-b border-slate-200/70 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#2563EB]" />
              <h2 className="text-sm font-bold text-slate-800">وضعیت خوابگاه</h2>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-center">
              <div className="flex items-center justify-around gap-4">
                <DonutGauge percent={summary.occupancyPercent} color="blue" size={124} />
                <div className="h-24 w-px bg-slate-100" />
                <div className="space-y-3 text-xs font-medium text-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB] shrink-0" />
                    <span>دانشجوی ساکن ({toPersianDigits(summary.totalOccupied)})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-200 shrink-0" />
                    <span>ظرفیت خالی ({toPersianDigits(summary.remainingCapacity)})</span>
                  </div>
                </div>
              </div>
              <div className="text-center text-xs font-semibold text-slate-600 mt-4 pt-3 border-t border-slate-100 tabular-nums">
                {toPersianDigits(summary.totalOccupied)} نفر از {toPersianDigits(summary.totalCapacity)} نفر ظرفیت کل
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Recent Activities Row */}
      {isAdmin ? (
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 bg-[#EEF4FF] border-b border-slate-200/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-[#2563EB]" />
              <h2 className="text-sm font-bold text-slate-800">آخرین فعالیت‌های کاربران</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('audit-logs')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <span>مشاهده همه</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500 bg-slate-50/50">
                  <th className="py-3 px-5 w-12"></th>
                  <th className="py-3 px-4">عملیات</th>
                  <th className="py-3 px-4">نام کاربر</th>
                  <th className="py-3 px-4">جزئیات</th>
                  <th className="py-3 px-5">تاریخ و زمان</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      فعالیتی ثبت نشده است.
                    </td>
                  </tr>
                ) : (
                  recentLogs.slice(0, 5).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-5">{getActionIcon(log.action)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{log.actorName}</td>
                      <td className="py-3 px-4 text-xs text-slate-500 max-w-xs truncate">
                        {log.details}
                      </td>
                      <td className="py-3 px-5 text-slate-500 text-xs tabular-nums whitespace-nowrap">
                        {formatShamsiDate(log.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile activity cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {recentLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">فعالیتی ثبت نشده است.</div>
            ) : (
              recentLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="p-4 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                    {getActionIcon(log.action)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800">{log.action}</span>
                      <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                        {formatShamsiDate(log.createdAt)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {log.actorName} — {log.details}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Supervisor Incoming Transfer Requests */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 bg-[#EEF4FF] border-b border-slate-200/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-[#2563EB]" />
                <h2 className="text-sm font-bold text-slate-800">درخواست‌های انتقال</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('transfers')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <span>مشاهده همه</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-center">
              {pendingTransfers.length === 0 ? (
                <div className="rounded-xl bg-[#F4F7FC] border border-slate-200/60 p-8 text-center">
                  <FileText className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-600">
                    درخواستی برای انتقال وجود ندارد
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingTransfers.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-800">
                          {t.studentName} ({toPersianDigits(t.studentNumber)})
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          از {t.fromDormName} به {t.toDormName} — اتاق {toPersianDigits(t.toRoomNumber ?? '—')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('transfers')}
                        className="px-3 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap"
                      >
                        بررسی درخواست
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Supervisor Recent Activities */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 bg-[#EEF4FF] border-b border-slate-200/70 flex items-center gap-2">
              <History className="w-5 h-5 text-[#2563EB]" />
              <h2 className="text-sm font-bold text-slate-800">آخرین فعالیت‌ها</h2>
            </div>

            <div className="overflow-x-auto hidden md:block flex-1">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-100 font-semibold text-slate-500 bg-slate-50/50">
                    <th className="py-3 px-4">عملیات</th>
                    <th className="py-3 px-4">توضیحات</th>
                    <th className="py-3 px-4">تاریخ و زمان</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentLogs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-500">
                        فعالیتی برای این خوابگاه ثبت نشده است.
                      </td>
                    </tr>
                  ) : (
                    recentLogs.slice(0, 4).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                          {log.action}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-[200px] truncate">
                          {log.details}
                        </td>
                        <td className="py-3 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                          {formatShamsiDate(log.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-100">
              {recentLogs.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  فعالیتی برای این خوابگاه ثبت نشده است.
                </div>
              ) : (
                recentLogs.slice(0, 4).map((log) => (
                  <div key={log.id} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800">{log.action}</span>
                      <span className="text-[10px] text-slate-500 tabular-nums">
                        {formatShamsiDate(log.createdAt)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 leading-5">{log.details}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {/* Compact Analytical Breakdown Strip */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
          <h3 className="text-xs font-bold text-slate-700 mb-3">توزیع دانشجویان بر اساس مقطع</h3>
          <div className="space-y-3">
            {[
              { label: 'کارشناسی', count: charts.byDegree['کارشناسی'], bar: 'bg-[#2563EB]' },
              { label: 'کاردانی', count: charts.byDegree['کاردانی'], bar: 'bg-emerald-500' },
            ].map((item) => {
              const total = Math.max(1, summary.totalOccupied);
              const pct = Math.round((item.count / total) * 100);
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">{item.label}</span>
                    <span className="font-bold text-slate-800 tabular-nums">
                      {toPersianDigits(item.count)} نفر ({toPersianDigits(pct)}٪)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${item.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
          <h3 className="text-xs font-bold text-slate-700 mb-3">توزیع ورودی مهر و بهمن</h3>
          <div className="space-y-3">
            {[
              { label: 'ورودی مهر', count: charts.byEntry['مهر'], bar: 'bg-indigo-600' },
              { label: 'ورودی بهمن', count: charts.byEntry['بهمن'], bar: 'bg-sky-500' },
            ].map((item) => {
              const total = Math.max(1, summary.totalOccupied);
              const pct = Math.round((item.count / total) * 100);
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">{item.label}</span>
                    <span className="font-bold text-slate-800 tabular-nums">
                      {toPersianDigits(item.count)} نفر ({toPersianDigits(pct)}٪)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${item.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
          <h3 className="text-xs font-bold text-slate-700 mb-3">خلاصه عملیات و رشته‌های برتر</h3>
          <div className="grid grid-cols-3 gap-2 text-center mb-3 pb-3 border-b border-slate-100">
            <div>
              <div className="text-lg font-extrabold text-slate-800 tabular-nums">
                {toPersianDigits(summary.movementsCount)}
              </div>
              <div className="text-[11px] text-slate-500">جابه‌جایی</div>
            </div>
            <div>
              <div className="text-lg font-extrabold text-amber-600 tabular-nums">
                {toPersianDigits(summary.pendingTransfersCount)}
              </div>
              <div className="text-[11px] text-slate-500">انتقال در انتظار</div>
            </div>
            <div>
              <div className="text-lg font-extrabold text-slate-600 tabular-nums">
                {toPersianDigits(summary.inactiveStudentsCount)}
              </div>
              <div className="text-[11px] text-slate-500">غیرفعال</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {charts.byMajor.slice(0, 3).map((m) => (
              <div key={m.major} className="flex justify-between text-xs text-slate-600">
                <span className="truncate">{m.major}</span>
                <span className="font-bold text-slate-800 tabular-nums shrink-0">
                  {toPersianDigits(m.count)} نفر
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Transfer Detail Modal from Dashboard */}
      <Modal
        open={Boolean(selectedTransfer)}
        onClose={() => setSelectedTransfer(null)}
        title="جزئیات درخواست انتقال"
        subtitle={
          selectedTransfer
            ? `${selectedTransfer.studentName} (${toPersianDigits(selectedTransfer.studentNumber)})`
            : ''
        }
        maxWidthClass="max-w-lg"
      >
        {selectedTransfer && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
              <div>
                <span className="text-slate-500 block">خوابگاه و اتاق مبدأ</span>
                <strong className="text-slate-900 mt-1 block">
                  {selectedTransfer.fromDormName} · اتاق{' '}
                  {toPersianDigits(selectedTransfer.fromRoomNumber)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">خوابگاه و اتاق مقصد</span>
                <strong className="text-blue-700 mt-1 block">
                  {selectedTransfer.toDormName} · اتاق{' '}
                  {toPersianDigits(selectedTransfer.toRoomNumber ?? '—')}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">ثبت‌کننده درخواست</span>
                <strong className="text-slate-900 mt-1 block">
                  {selectedTransfer.requestedByName}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">تاریخ ثبت</span>
                <strong className="text-slate-900 mt-1 block tabular-nums">
                  {formatShamsiDate(selectedTransfer.requestedAt)}
                </strong>
              </div>
            </div>
            <div>
              <span className="text-slate-500 block mb-1">علت انتقال:</span>
              <p className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-800">
                {selectedTransfer.reason}
              </p>
            </div>
            <div className="flex items-center justify-between pt-2">
              <StatusBadge label={selectedTransfer.status} />
              <button
                type="button"
                onClick={() => {
                  setSelectedTransfer(null);
                  onNavigate('transfers');
                }}
                className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold"
              >
                رفتن به صفحه درخواست‌های انتقال
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
