"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, Store, X } from "lucide-react";

type Customer = { id: string; name: string };

export function StoreFilter({
  customers,
  selectedIds,
}: {
  customers: Customer[];
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const selectAll = () => setSelected(new Set(customers.map((c) => c.id)));
  const clearAll = () => setSelected(new Set<string>());

  const noneSelected = selected.size === 0;
  const allSelected = selected.size === customers.length && customers.length > 0;

  const label = noneSelected
    ? "ร้านค้าทั้งหมด"
    : allSelected
      ? "ทุกร้านค้า"
      : `${selected.size} ร้านที่เลือก`;

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden input carries comma-separated IDs to the GET form */}
      <input type="hidden" name="stores" value={[...selected].join(",")} />

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-xl border-0 bg-white py-2.5 pl-3 pr-3 text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#003366]/20 ${
          open ? "ring-2 ring-[#003366]/20" : "ring-1 ring-slate-200"
        }`}
      >
        <Store className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} />
        <span
          className={`flex-1 text-left ${
            noneSelected ? "text-slate-400" : "font-medium text-slate-800"
          }`}
        >
          {label}
        </span>
        {!noneSelected && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                clearAll();
              }
            }}
            className="shrink-0 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[260px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {/* Search */}
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาร้านค้า..."
                className="w-full rounded-lg py-1.5 pl-8 pr-3 text-sm text-slate-700 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-[#003366]/20"
              />
            </div>
          </div>

          {/* Select / clear all */}
          <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-semibold text-[#003366] hover:underline"
            >
              เลือกทั้งหมด
            </button>
            <span className="text-slate-200">|</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-semibold text-slate-400 hover:underline"
            >
              ยกเลิกทั้งหมด
            </button>
            {!noneSelected && (
              <span className="ml-auto text-xs text-slate-400">
                เลือก {selected.size}/{customers.length}
              </span>
            )}
          </div>

          {/* Checkbox list */}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-center text-sm text-slate-400">
                ไม่พบร้านค้า
              </p>
            ) : (
              filtered.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="h-4 w-4 rounded border-slate-300 accent-[#003366]"
                  />
                  <span
                    className={`flex-1 truncate ${selected.has(c.id) ? "font-medium text-slate-800" : "text-slate-600"}`}
                  >
                    {c.name}
                  </span>
                  {selected.has(c.id) && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#003366]" />
                  )}
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
