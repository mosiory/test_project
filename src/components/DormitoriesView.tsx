import { useState, type FormEvent } from 'react';
import { BedDouble, Building2, Edit3, Eye, Users } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import { type Dormitory, type NavTab, type RoomRecord, toPersianDigits } from '../shared/dormRules';
import { DonutGauge } from './ui/DonutGauge';
import { Modal } from './ui/Modal';
import { PageHeader } from './ui/PageHeader';
import { ErrorBanner, SuccessBanner } from './ui/StateViews';
import { StatusBadge } from './ui/StatusBadge';

interface DormitoriesViewProps {
  dorms: Dormitory[];
  onNavigate: (tab: NavTab, options?: { dormId?: number }) => void;
  onDataChanged: () => void;
}

export function DormitoriesView({
  dorms,
  onNavigate,
  onDataChanged,
}: DormitoriesViewProps) {
  const [editing, setEditing] = useState<Dormitory | null>(null);
  const [name, setName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [detailDorm, setDetailDorm] = useState<Dormitory | null>(null);
  const [detailRooms, setDetailRooms] = useState<RoomRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const openEdit = (d: Dormitory) => {
    setEditing(d);
    setName(d.name);
    setSubtitle(d.subtitle);
    setAddress(d.address);
    setError('');
  };

  const openDetail = async (d: Dormitory) => {
    setDetailDorm(d);
    setDetailRooms([]);
    setLoadingDetail(true);
    try {
      const res = await apiRequest<{ rooms: RoomRecord[] }>(`/api/rooms?dormId=${d.id}`);
      setDetailRooms(res.rooms);
    } catch {
      setDetailRooms([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError('');
    setSubmitting(true);
    try {
      await apiRequest(`/api/dormitories/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, subtitle, address }),
      });
      setEditing(null);
      setSuccessMsg('مشخصات خوابگاه با موفقیت به‌روزرسانی شد.');
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در ذخیره اطلاعات خوابگاه.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="مدیریت خوابگاه‌های دانشگاه"
        subtitle="نمای متمرکز دو خوابگاه مستقل دانشگاه، بررسی ظرفیت کل، جزئیات اتاق‌ها و مدیریت مشخصات هر مرکز"
        breadcrumbLabel="مدیریت خوابگاه‌ها"
        icon={<Building2 className="w-5 h-5" />}
        onNavigateDashboard={() => onNavigate('dashboard')}
      />

      <SuccessBanner message={successMsg} onClose={() => setSuccessMsg('')} />
      <ErrorBanner message={error} onClose={() => setError('')} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {dorms.map((d, idx) => (
          <div
            key={d.id}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-extrabold text-slate-900">خوابگاه {d.name}</h2>
                  <StatusBadge label={d.isActive ? 'فعال' : 'غیرفعال'} />
                </div>
                <p className="text-xs font-semibold text-blue-700 mt-1">پردیس: {d.subtitle}</p>
                <p className="text-xs text-slate-500 mt-1.5">{d.address || 'نشانی ثبت نشده'}</p>
                {d.supervisorName && (
                  <p className="text-xs text-slate-600 mt-1">
                    سرپرست خوابگاه: <strong className="text-slate-800">{d.supervisorName}</strong>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => openEdit(d)}
                aria-label={`ویرایش ${d.name}`}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600"
                title="ویرایش مشخصات خوابگاه"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-around gap-4 py-4 border-y border-slate-100">
              <DonutGauge
                percent={d.occupancyPercent}
                color={idx === 0 ? 'blue' : 'emerald'}
                size={124}
              />
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-xl font-extrabold text-slate-900 tabular-nums">
                    {toPersianDigits(d.totalRooms)}
                  </div>
                  <div className="text-[11px] text-slate-500">تعداد کل اتاق‌ها</div>
                </div>
                <div>
                  <div className="text-xl font-extrabold text-slate-900 tabular-nums">
                    {toPersianDigits(d.totalCapacity)}
                  </div>
                  <div className="text-[11px] text-slate-500">ظرفیت کل</div>
                </div>
                <div>
                  <div className="text-xl font-extrabold text-blue-700 tabular-nums">
                    {toPersianDigits(d.occupiedCount)}
                  </div>
                  <div className="text-[11px] text-slate-500">دانشجویان ساکن</div>
                </div>
                <div>
                  <div className="text-xl font-extrabold text-emerald-600 tabular-nums">
                    {toPersianDigits(d.remainingCapacity)}
                  </div>
                  <div className="text-[11px] text-slate-500">ظرفیت خالی</div>
                </div>
                <div>
                  <div className="text-xl font-extrabold text-amber-600 tabular-nums">
                    {toPersianDigits(d.extraOccupied)} / {toPersianDigits(d.extraCapacity)}
                  </div>
                  <div className="text-[11px] text-slate-500">ظرفیت مازاد (پر/کل)</div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openDetail(d)}
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
              >
                <Eye className="w-4 h-4" />
                <span>مشاهده جزئیات</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('students', { dormId: d.id })}
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold"
              >
                <Users className="w-4 h-4" />
                <span>دانشجویان خوابگاه</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('rooms', { dormId: d.id })}
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-xs font-bold"
              >
                <BedDouble className="w-4 h-4" />
                <span>اتاق‌های خوابگاه</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Dormitory Detail Modal */}
      <Modal
        open={Boolean(detailDorm)}
        onClose={() => setDetailDorm(null)}
        title={detailDorm ? `جزئیات خوابگاه ${detailDorm.name}` : ''}
        subtitle={detailDorm?.subtitle}
        maxWidthClass="max-w-2xl"
      >
        {detailDorm && (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
              <div>
                <span className="text-slate-500 block">سرپرست خوابگاه</span>
                <strong className="text-slate-900 mt-1 block">
                  {detailDorm.supervisorName ?? 'تعیین‌نشده'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">اتاق‌های فعال / کل</span>
                <strong className="text-slate-900 mt-1 block tabular-nums">
                  {toPersianDigits(detailDorm.activeRooms)} از {toPersianDigits(detailDorm.totalRooms)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">ظرفیت پر / کل</span>
                <strong className="text-blue-700 mt-1 block tabular-nums">
                  {toPersianDigits(detailDorm.occupiedCount)} از {toPersianDigits(detailDorm.totalCapacity)} نفر
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">درصد اشغال</span>
                <strong className="text-emerald-700 mt-1 block tabular-nums">
                  {toPersianDigits(detailDorm.occupancyPercent)}٪
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">ظرفیت مازاد پر / کل</span>
                <strong className="text-amber-700 mt-1 block tabular-nums">
                  {toPersianDigits(detailDorm.extraOccupied)} از{' '}
                  {toPersianDigits(detailDorm.extraCapacity)} نفر
                </strong>
              </div>
            </div>

            <div className="text-slate-600">
              <strong className="text-slate-800">نشانی:</strong>{' '}
              {detailDorm.address || 'ثبت نشده'}
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">وضعیت اتاق‌های این خوابگاه</h3>
              {loadingDetail ? (
                <div className="p-6 text-center text-slate-500">در حال دریافت وضعیت اتاق‌ها...</div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#EEF4FF] border-b border-slate-200 text-slate-700 font-bold">
                      <tr>
                        <th className="py-2.5 px-3">شماره اتاق</th>
                        <th className="py-2.5 px-3">طبقه</th>
                        <th className="py-2.5 px-3">ظرفیت</th>
                        <th className="py-2.5 px-3">ساکن</th>
                        <th className="py-2.5 px-3">خالی</th>
                        <th className="py-2.5 px-3">وضعیت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailRooms.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2 px-3 font-bold tabular-nums">
                            اتاق {toPersianDigits(r.roomNumber)}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{r.floor}</td>
                          <td className="py-2 px-3 tabular-nums">{toPersianDigits(r.capacity)}</td>
                          <td className="py-2 px-3 tabular-nums">{toPersianDigits(r.occupied)}</td>
                          <td className="py-2 px-3 tabular-nums">{toPersianDigits(r.remaining)}</td>
                          <td className="py-2 px-3">
                            <StatusBadge
                              label={
                                !r.isActive
                                  ? 'غیرفعال'
                                  : r.status === 'full'
                                  ? 'تکمیل ظرفیت'
                                  : r.status === 'empty'
                                  ? 'خالی'
                                  : 'دارای ظرفیت'
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const id = detailDorm.id;
                  setDetailDorm(null);
                  onNavigate('students', { dormId: id });
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-700"
              >
                مشاهده دانشجویان
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = detailDorm.id;
                  setDetailDorm(null);
                  onNavigate('rooms', { dormId: id });
                }}
                className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold"
              >
                مدیریت اتاق‌ها
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Dormitory Modal */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `ویرایش خوابگاه ${editing.name}` : ''}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="dm-name" className="block text-xs font-semibold text-slate-700 mb-1">
              نام خوابگاه *
            </label>
            <input
              id="dm-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label htmlFor="dm-sub" className="block text-xs font-semibold text-slate-700 mb-1">
              نام پردیس / عنوان کوتاه
            </label>
            <input
              id="dm-sub"
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label htmlFor="dm-addr" className="block text-xs font-semibold text-slate-700 mb-1">
              نشانی
            </label>
            <textarea
              id="dm-addr"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold"
            >
              ذخیره تغییرات
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
