"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const THAI_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const THAI_WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function parseIsoDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatThaiDate(iso: string) {
  if (!iso) return "เลือกวันที่";
  const date = parseIsoDate(iso);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear() + 543}`;
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function clampMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

type ThaiDatePickerProps = {
  id: string;
  name: string;
  defaultValue?: string;
  value?: string;
  min?: string;
  max?: string;
  placeholder?: string;
  onChange?: (nextValue: string) => void;
  compact?: boolean;
  matchFieldHeight?: boolean;
};

function buildYearOptions(baseYear: number, minDate: Date | null, maxDate: Date | null) {
  const startYear = minDate ? minDate.getFullYear() : baseYear - 10;
  const endYear = maxDate ? maxDate.getFullYear() : baseYear + 10;
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

export function ThaiDatePicker({
  id,
  name,
  defaultValue = "",
  value,
  min,
  max,
  placeholder = "เลือกวันที่",
  onChange,
  compact = false,
  matchFieldHeight = false,
}: ThaiDatePickerProps) {
  const [internalValue, setInternalValue] = useState(value ?? defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() =>
    clampMonth((value ?? defaultValue) ? parseIsoDate(value ?? defaultValue) : new Date()),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentValue = value ?? internalValue;

  const minDate = useMemo(() => (min ? parseIsoDate(min) : null), [min]);
  const maxDate = useMemo(() => (max ? parseIsoDate(max) : null), [max]);
  const selectedDate = useMemo(() => (currentValue ? parseIsoDate(currentValue) : null), [currentValue]);
  const todayIso = useMemo(() => formatIsoDate(new Date()), []);
  const yearOptions = useMemo(
    () => buildYearOptions((selectedDate ?? new Date()).getFullYear(), minDate, maxDate),
    [maxDate, minDate, selectedDate],
  );

  const [prevValue, setPrevValue] = useState(value);
  const [prevDefaultValue, setPrevDefaultValue] = useState(defaultValue);

  if (value !== prevValue || defaultValue !== prevDefaultValue) {
    setPrevValue(value);
    setPrevDefaultValue(defaultValue);
    const nextValue = value ?? defaultValue;
    setInternalValue(nextValue);
    if (nextValue) {
      setViewMonth(clampMonth(parseIsoDate(nextValue)));
    }
  }

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  const days = useMemo(() => {
    const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startOffset = firstDay.getDay();
    const startDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1 - startOffset);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index);
      const iso = formatIsoDate(date);
      const isCurrentMonth = date.getMonth() === viewMonth.getMonth();
      const isDisabled = (minDate !== null && date < minDate) || (maxDate !== null && date > maxDate);

      return { date, iso, isCurrentMonth, isDisabled };
    });
  }, [viewMonth, minDate, maxDate]);

  const prevMonthDisabled = useMemo(() => {
    if (!minDate) return false;
    const prevMonth = addMonths(viewMonth, -1);
    const lastDayOfPrevMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0);
    return lastDayOfPrevMonth < minDate;
  }, [minDate, viewMonth]);

  const nextMonthDisabled = useMemo(() => {
    if (!maxDate) return false;
    const nextMonth = addMonths(viewMonth, 1);
    return nextMonth > new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  }, [maxDate, viewMonth]);

  function openPicker() {
    setViewMonth(clampMonth(selectedDate ?? new Date()));
    setIsOpen(true);
  }

  function closePicker() {
    setIsOpen(false);
  }

  function selectDate(iso: string) {
    if (value === undefined) {
      setInternalValue(iso);
    }
    onChange?.(iso);
    setIsOpen(false);
  }

  function jumpToToday() {
    const today = parseIsoDate(todayIso);
    if ((minDate && today < minDate) || (maxDate && today > maxDate)) return;
    setViewMonth(clampMonth(today));
    if (value === undefined) {
      setInternalValue(todayIso);
    }
    onChange?.(todayIso);
    setIsOpen(false);
  }

  function updateViewMonth(year: number, month: number) {
    setViewMonth(new Date(year, month, 1));
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <input type="hidden" id={id} name={name} value={currentValue} />

      <button
        type="button"
        onClick={() => (isOpen ? closePicker() : openPicker())}
        className={`flex w-full min-w-0 items-center justify-between rounded-xl border bg-white text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#003366]/10 ${
          compact
            ? matchFieldHeight
              ? "gap-2 px-3 py-2.5 text-sm"
              : "gap-1.5 px-2.5 py-2 text-[13px]"
            : "gap-1.5 px-2.5 py-3 sm:gap-2 sm:px-4"
        } ${
          isOpen ? "border-[#003366]" : "border-slate-300 hover:border-[#003366]/40"
        }`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={`${id}-dialog`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${
            compact ? (matchFieldHeight ? "text-sm" : "text-[13px]") : "text-[13px] sm:text-base"
          } ${
            value ? "font-medium text-slate-800" : "text-slate-400"
          }`}
        >
          {currentValue ? formatThaiDate(currentValue) : placeholder}
        </span>
        <CalendarDays
          className={`shrink-0 text-slate-400 ${
            compact ? (matchFieldHeight ? "h-4 w-4" : "h-3.5 w-3.5") : "h-[15px] w-[15px] sm:h-5 sm:w-5"
          }`}
          strokeWidth={2}
        />
      </button>

      {isOpen && (
        <div
          id={`${id}-dialog`}
          role="dialog"
          aria-modal="true"
          className="absolute left-0 top-[calc(100%+0.25rem)] z-50 w-[15.75rem] max-w-[min(15.75rem,calc(100vw-1rem))] overflow-hidden rounded-[0.8rem] border border-slate-200 bg-white shadow-[0_12px_24px_rgba(15,23,42,0.1)]"
        >
          <div className="border-b border-slate-200 bg-[#003366] px-2 py-1.5 text-white">
            <div className="grid grid-cols-[24px_1fr_24px] items-center gap-1">
              <button
                type="button"
                onClick={() => setViewMonth((current) => addMonths(current, -1))}
                disabled={prevMonthDisabled}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="เดือนก่อนหน้า"
              >
                <ChevronLeft className="h-3 w-3" strokeWidth={2.3} />
              </button>

              <p className="text-center text-xs font-semibold">{currentValue ? formatThaiDate(currentValue) : placeholder}</p>

              <button
                type="button"
                onClick={() => setViewMonth((current) => addMonths(current, 1))}
                disabled={nextMonthDisabled}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="เดือนถัดไป"
              >
                <ChevronRight className="h-3 w-3" strokeWidth={2.3} />
              </button>
            </div>
          </div>

          <div className="space-y-1 px-1.5 py-1.5">
            <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-1 py-1">
              <select
                value={viewMonth.getMonth()}
                onChange={(event) => updateViewMonth(viewMonth.getFullYear(), Number(event.target.value))}
                className="h-6 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-800 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                aria-label="เลือกเดือน"
              >
                {THAI_MONTHS_FULL.map((month, index) => (
                  <option key={month} value={index}>
                    {month}
                  </option>
                ))}
              </select>

              <select
                value={viewMonth.getFullYear()}
                onChange={(event) => updateViewMonth(Number(event.target.value), viewMonth.getMonth())}
                className="h-6 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-800 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                aria-label="เลือกปี"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year + 543}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
              {THAI_WEEKDAYS.map((label) => (
                <div key={label} className="py-0.5 text-[10px] font-semibold text-slate-500">
                  {label}
                </div>
              ))}
              {days.map(({ date, iso, isCurrentMonth, isDisabled }) => {
                const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
                const isToday = iso === todayIso;

                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => selectDate(iso)}
                    disabled={isDisabled}
                    className={[
                      "flex h-6 items-center justify-center rounded-md text-[11px] font-semibold transition",
                      isSelected
                        ? "bg-[#003366] text-white shadow-[0_12px_24px_rgba(0,51,102,0.24)]"
                        : isToday
                          ? "border border-[#003366]/30 bg-[#003366]/5 text-[#003366]"
                          : isCurrentMonth
                            ? "text-slate-700 hover:bg-slate-100"
                            : "text-slate-300 hover:bg-slate-50",
                      isDisabled ? "cursor-not-allowed opacity-30" : "",
                    ].join(" ")}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-1">
              <button
                type="button"
                onClick={jumpToToday}
                className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                วันนี้
              </button>
              <button
                type="button"
                onClick={closePicker}
                className="flex-1 rounded-md bg-[#003366] px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-[#0a2747]"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
