import DatePickerModule, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import { toEnglishDigits } from '../../shared/dormRules';

interface JalaliDatePickerProps {
  id?: string;
  /** مقدار به صورت تاریخ میلادی ISO (YYYY-MM-DD) ذخیره می‌شود */
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

// سازگاری با خروجی CommonJS بسته در Vite
const DatePicker =
  ((DatePickerModule as unknown as { default?: typeof DatePickerModule }).default ??
    DatePickerModule) as typeof DatePickerModule;

/** تبدیل تاریخ انتخاب‌شدهٔ شمسی به رشتهٔ میلادی YYYY-MM-DD */
function toIsoDate(date: DateObject): string {
  return toEnglishDigits(date.convert(gregorian).format('YYYY-MM-DD'));
}

/** انتخابگر تاریخ شمسی (جلالی) برای فیلترهای تاریخ */
export function JalaliDatePicker({
  id,
  value,
  onChange,
  placeholder = 'انتخاب تاریخ شمسی',
  ariaLabel,
  className = '',
}: JalaliDatePickerProps) {
  return (
    <DatePicker
      id={id}
      value={value ? new DateObject({ date: value, calendar: gregorian }) : ''}
      onChange={(date) => {
        if (!date || Array.isArray(date)) {
          onChange('');
          return;
        }
        onChange(toIsoDate(date as DateObject));
      }}
      calendar={persian}
      locale={persian_fa}
      calendarPosition="bottom-right"
      format="YYYY/MM/DD"
      editable={false}
      onOpenPickNewDate={false}
      placeholder={placeholder}
      aria-label={ariaLabel}
      inputClass="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white text-right tabular-nums"
      className={`rmdp-fa ${className}`}
    />
  );
}
