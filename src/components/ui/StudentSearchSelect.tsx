import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search, UserRound } from 'lucide-react';
import type { StudentRecord } from '../../shared/dormRules';
import { toPersianDigits } from '../../shared/dormRules';
import { matchesKeywords, normalizeFa } from '../../shared/search';

interface StudentSearchSelectProps {
  id?: string;
  students: StudentRecord[];
  value: number;
  onChange: (studentId: number) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyText?: string;
}

/**
 * انتخاب دانشجو با جست‌وجوی زنده بر اساس نام، نام خانوادگی، کد ملی،
 * شماره دانشجویی و شماره همراه به‌همراه پیشنهاد خودکار.
 */
export function StudentSearchSelect({
  id,
  students,
  value,
  onChange,
  disabled = false,
  placeholder = 'جست‌وجو یا انتخاب دانشجو (نام، نام خانوادگی، کد ملی)...',
  emptyText = 'دانشجویی با این عبارت یافت نشد.',
}: StudentSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => students.find((s) => s.id === value) ?? null,
    [students, value]
  );

  const suggestions = useMemo(() => {
    return students.filter((s) =>
      matchesKeywords(
        [
          s.firstName,
          s.lastName,
          `${s.firstName} ${s.lastName}`,
          s.studentNumber,
          s.nationalCode,
          s.mobile,
          s.currentDormName,
          s.currentRoomNumber,
        ],
        query
      )
    );
  }, [students, query]);

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

  const selectStudent = (studentId: number) => {
    onChange(studentId);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative" ref={rootRef}>
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
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white text-right flex items-center justify-between gap-2 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none disabled:bg-slate-100"
      >
        <span className="flex items-center gap-2 min-w-0">
          <UserRound className="w-4 h-4 text-slate-400 shrink-0" />
          {selected ? (
            <span className="truncate text-slate-800">
              <strong className="font-bold">{selected.firstName} {selected.lastName}</strong>{' '}
              <span className="num text-slate-600">({toPersianDigits(selected.studentNumber)})</span>
              {selected.currentDormName && (
                <span className="text-slate-500"> — {selected.currentDormName}</span>
              )}
            </span>
          ) : (
            <span className="truncate text-slate-400">{placeholder}</span>
          )}
        </span>
        <ChevronsUpDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute z-[70] mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden animate-[modalPop_140ms_ease-out_both]">
          <div className="relative border-b border-slate-100">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="نام، نام خانوادگی، کد ملی یا شماره دانشجویی..."
              className="w-full pr-9 pl-3 py-2.5 text-xs outline-none"
              aria-label="جست‌وجوی دانشجو"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto no-scrollbar py-1">
            {suggestions.length === 0 ? (
              <li className="px-3 py-4 text-xs text-slate-500 text-center">{emptyText}</li>
            ) : (
              suggestions.map((s) => {
                const isSelected = s.id === value;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => selectStudent(s.id)}
                      className={`w-full text-right px-3 py-2.5 text-xs flex items-center justify-between gap-3 hover:bg-blue-50 ${
                        isSelected ? 'text-blue-700 font-bold bg-blue-50/60' : 'text-slate-700'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block font-bold text-slate-800 truncate">
                          {s.firstName} {s.lastName}
                        </span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">
                          <span className="num">{toPersianDigits(s.studentNumber)}</span>
                          {s.nationalCode ? (
                            <> · کد ملی: <span className="num">{toPersianDigits(s.nationalCode)}</span></>
                          ) : null}
                          {s.currentDormName ? (
                            <> · {s.currentDormName}</>
                          ) : null}
                        </span>
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="border-t border-slate-100 px-3 py-1.5 text-[10.5px] text-slate-500 bg-slate-50/60">
            {toPersianDigits(suggestions.length)} دانشجو مطابق جست‌وجو
            {query.trim() ? ` «${normalizeFa(query).trim()}»` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
