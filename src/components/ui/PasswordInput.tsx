import { useState, type ChangeEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoFocus?: boolean;
  autoComplete?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * فیلد رمز عبور با دکمهٔ نمایش/مخفی‌سازی (علامت چشم)
 * در تمام فرم‌هایی که رمز دریافت می‌کنند استفاده می‌شود.
 */
export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  required = false,
  minLength,
  autoFocus = false,
  autoComplete = 'new-password',
  className = '',
  disabled = false,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        dir="ltr"
        required={required}
        minLength={minLength}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        disabled={disabled}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={`w-full pl-10 pr-3 py-2 rounded-xl border border-slate-200 text-sm text-left num disabled:bg-slate-100 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور'}
        title={visible ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور'}
        aria-pressed={visible}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        tabIndex={0}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
