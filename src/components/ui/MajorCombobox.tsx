import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { MAJOR_OPTIONS } from '../../shared/dormRules';
import { normalizeFa } from '../../shared/search';

interface MajorComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * فیلد رشتهٔ تحصیلی: هم کشویی (لیست کامل) و هم قابل جست‌وجو با حروف
 */
export function MajorCombobox({
  id,
  value,
  onChange,
  disabled = false,
  placeholder = 'جست‌وجو یا انتخاب رشته...',
  className = '',
}: MajorComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const options = useMemo(() => {
    const q = normalizeFa(query).trim();
    const list = q
      ? MAJOR_OPTIONS.filter((m) => normalizeFa(m).includes(q))
      : MAJOR_OPTIONS;
    const extra = value && !MAJOR_OPTIONS.includes(value) ? [value] : [];
    return [...extra, ...list];
  }, [query, value]);

  const selectMajor = (major: string) => {
    onChange(major);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 30);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white text-right flex items-center justify-between gap-2 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none disabled:bg-slate-100"
      >
        <span className={`truncate ${value ? 'text-slate-800' : 'text-slate-400'}`}>
          {value || placeholder}
        </span>
        <ChevronsUpDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute z-[60] mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden animate-[modalPop_140ms_ease-out_both]">
          <div className="relative border-b border-slate-100">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="تایپ کنید تا فیلتر شود..."
              className="w-full pr-9 pl-3 py-2 text-xs outline-none"
              aria-label="جست‌وجوی رشته"
            />
          </div>
          <ul role="listbox" className="max-h-52 overflow-y-auto no-scrollbar py-1">
            {options.length === 0 ? (
              <li className="px-3 py-3 text-xs text-slate-500 text-center">
                رشته‌ای با این عبارت یافت نشد.
              </li>
            ) : (
              options.map((major) => (
                <li key={major}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === major}
                    onClick={() => selectMajor(major)}
                    className={`w-full text-right px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-blue-50 ${
                      value === major ? 'text-blue-700 font-bold bg-blue-50/60' : 'text-slate-700'
                    }`}
                  >
                    <span className="truncate">{major}</span>
                    {value === major && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
