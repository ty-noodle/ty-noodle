"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { ChevronUp, Search } from "lucide-react";
import { settingsInputClass } from "@/components/settings/settings-ui";

export type SearchableOption = {
  code: number;
  label: string;
};

type SearchableSelectProps = {
  disabled?: boolean;
  id?: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder: string;
  value: string;
};

const MAX_VISIBLE_OPTIONS = 80;

export function SearchableSelect({
  disabled = false,
  id,
  onChange,
  options,
  placeholder,
  value,
}: SearchableSelectProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const selectedOption = options.find((option) => String(option.code) === value) ?? null;
  const inputValue = isOpen ? query : (selectedOption?.label ?? query);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("th");

    if (!normalizedQuery) {
      return options.slice(0, MAX_VISIBLE_OPTIONS);
    }

    return options
      .filter((option) => option.label.toLocaleLowerCase("th").includes(normalizedQuery))
      .slice(0, MAX_VISIBLE_OPTIONS);
  }, [deferredQuery, options]);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
        <Search className="h-4 w-4" strokeWidth={2} />
      </div>

      <input
        id={inputId}
        value={inputValue}
        disabled={disabled}
        onFocus={() => {
          if (!disabled) {
            setQuery(selectedOption?.label ?? "");
            setIsOpen(true);
          }
        }}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setIsOpen(true);

          if (!nextQuery.trim()) {
            onChange("");
          }
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setIsOpen(false);
          }, 120);
        }}
        className={`${settingsInputClass} pl-10 pr-10`}
        placeholder={placeholder}
        autoComplete="off"
      />

      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
        <ChevronUp className={`h-4 w-4 transition ${isOpen ? "" : "rotate-180"}`} strokeWidth={2} />
      </div>

      {isOpen && !disabled ? (
        <div className="absolute bottom-full z-20 mb-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          <div className="max-h-64 overflow-y-auto p-2">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(String(option.code));
                    setQuery(option.label);
                    setIsOpen(false);
                  }}
                  className={`flex w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                    String(option.code) === value
                      ? "bg-sky-50 font-semibold text-sky-700"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-slate-500">ไม่พบรายการที่ค้นหา</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
