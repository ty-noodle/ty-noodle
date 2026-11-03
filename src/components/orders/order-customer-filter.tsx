"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Store, X } from "lucide-react";

type OrderCustomerFilterOption = {
  id: string;
  code: string;
  name: string;
};

type OrderCustomerFilterProps = {
  name?: string;
  options: OrderCustomerFilterOption[];
  selectedIds: string[];
  placeholder?: string;
  className?: string;
};

function FilterPanel({
  filteredOptions,
  query,
  selected,
  onChangeQuery,
  onClearQuery,
  onToggleOption,
  onSelectAllVisible,
  onClearSelection,
}: {
  filteredOptions: OrderCustomerFilterOption[];
  query: string;
  selected: string[];
  onChangeQuery: (value: string) => void;
  onClearQuery: () => void;
  onToggleOption: (optionId: string) => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
}) {
  return (
    <>
      <div className="border-b border-slate-100 p-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => onChangeQuery(event.target.value)}
            placeholder="ค้นหาร้านค้า"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm font-medium text-slate-950 outline-none transition focus:border-[#003366] focus:bg-white"
          />
          {query ? (
            <button
              type="button"
              onClick={onClearQuery}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
              aria-label="ล้างคำค้นหาร้านค้า"
            >
              <X className="h-4 w-4" strokeWidth={2.2} />
            </button>
          ) : null}
        </label>

        <div className="mt-3 flex items-center justify-between gap-2 text-xs font-bold text-slate-600">
          <button
            type="button"
            onClick={onSelectAllVisible}
            className="rounded-lg px-2 py-1 transition hover:bg-slate-100"
          >
            เลือกทั้งหมดที่แสดง
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded-lg px-2 py-1 transition hover:bg-slate-100"
          >
            ล้างที่เลือก
          </button>
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto p-2 custom-scrollbar">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => {
            const isChecked = selected.includes(option.id);
            return (
              <label
                key={option.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleOption(option.id)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-950">
                    {option.code} - {option.name}
                  </span>
                </span>
                {isChecked ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#003366]" strokeWidth={3} />
                ) : null}
              </label>
            );
          })
        ) : (
          <div className="px-3 py-6 text-center text-sm font-medium text-slate-500">ไม่พบร้านค้าที่ค้นหา</div>
        )}
      </div>
    </>
  );
}

export function OrderCustomerFilter({
  name = "customers",
  options,
  selectedIds,
  placeholder = "เลือกร้านค้า",
  className = "",
}: OrderCustomerFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelected(selectedIds);
  }, [selectedIds]);

  useEffect(() => {
    function syncViewport() {
      setIsMobileViewport(window.innerWidth < 1024);
    }

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (!isOpen || isMobileViewport) return;

    function handleOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen, isMobileViewport]);

  useEffect(() => {
    if (!isOpen || !isMobileViewport) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, isMobileViewport]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th");
    if (!normalizedQuery) return options;
    return options.filter((option) =>
      `${option.code} ${option.name}`.toLocaleLowerCase("th").includes(normalizedQuery),
    );
  }, [options, query]);

  const selectedLabel = useMemo(() => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) {
      const selectedOption = options.find((option) => option.id === selected[0]);
      return selectedOption ? `${selectedOption.code} - ${selectedOption.name}` : placeholder;
    }
    return `เลือกร้านแล้ว ${selected.length} ร้าน`;
  }, [options, placeholder, selected]);

  function toggleOption(optionId: string) {
    setSelected((current) =>
      current.includes(optionId)
        ? current.filter((value) => value !== optionId)
        : [...current, optionId],
    );
  }

  function clearSelection() {
    setSelected([]);
  }

  function selectAllVisible() {
    const visibleIds = filteredOptions.map((option) => option.id);
    setSelected((current) => Array.from(new Set([...current, ...visibleIds])));
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input type="hidden" name={name} value={selected.join(",")} />
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex w-full items-center justify-between gap-3 rounded-lg border border-white/25 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-950 shadow-sm outline-none transition hover:border-[#003366]/25 focus-visible:ring-2 focus-visible:ring-[#003366]/15"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Store className="h-4 w-4 shrink-0 text-[#003366]" strokeWidth={2.2} />
          <span className="truncate">{selectedLabel}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition ${isOpen ? "rotate-180" : ""}`}
          strokeWidth={2.4}
        />
      </button>

      {isOpen && !isMobileViewport ? (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-full min-w-[290px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
          <FilterPanel
            filteredOptions={filteredOptions}
            query={query}
            selected={selected}
            onChangeQuery={setQuery}
            onClearQuery={() => setQuery("")}
            onToggleOption={toggleOption}
            onSelectAllVisible={selectAllVisible}
            onClearSelection={clearSelection}
          />
        </div>
      ) : null}

      {isOpen && isMobileViewport ? (
        <>
          <div
            aria-hidden="true"
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="เลือกร้านค้า"
            className="fixed inset-x-0 bottom-0 z-[71] rounded-t-[2rem] bg-white shadow-[0_-24px_64px_rgba(15,23,42,0.18)]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-base font-black text-slate-950">เลือกร้านค้า</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500">ค้นหาและติ๊กหลายร้านได้</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                aria-label="ปิดเลือกร้านค้า"
              >
                <X className="h-5 w-5" strokeWidth={2.4} />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
              <FilterPanel
                filteredOptions={filteredOptions}
                query={query}
                selected={selected}
                onChangeQuery={setQuery}
                onClearQuery={() => setQuery("")}
                onToggleOption={toggleOption}
                onSelectAllVisible={selectAllVisible}
                onClearSelection={clearSelection}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
