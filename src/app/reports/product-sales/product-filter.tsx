"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Package, Search, X } from "lucide-react";

type ProductOption = {
  categoryNames: string[];
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
};

export function ProductFilter({
  products,
  selectedIds,
}: {
  products: ProductOption[];
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const filtered = products.filter((product) => {
    const term = search.toLowerCase();
    return (
      product.name.toLowerCase().includes(term) ||
      product.sku.toLowerCase().includes(term) ||
      product.categoryNames.some((categoryName) =>
        categoryName.toLowerCase().includes(term),
      )
    );
  });

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

  const selectAll = () => setSelected(new Set(products.map((product) => product.id)));
  const clearAll = () => setSelected(new Set<string>());

  const noneSelected = selected.size === 0;
  const allSelected = selected.size === products.length && products.length > 0;

  const label = noneSelected
    ? "ทุกสินค้า"
    : allSelected
      ? "เลือกสินค้าทั้งหมด"
      : `${selected.size} รายการที่เลือก`;

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name="products" value={[...selected].join(",")} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-xl border-0 bg-white py-2.5 pl-3 pr-3 text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#003366]/20 ${
          open ? "ring-2 ring-[#003366]/20" : "ring-1 ring-slate-200"
        }`}
      >
        <Package className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} />
        <span className={`flex-1 truncate text-left ${noneSelected ? "text-slate-400" : "font-medium text-slate-800"}`}>
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

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[320px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาสินค้า..."
                className="w-full rounded-lg py-1.5 pl-8 pr-3 text-sm text-slate-700 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-[#003366]/20"
              />
            </div>
          </div>

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
                เลือก {selected.size}/{products.length}
              </span>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-center text-sm text-slate-400">
                ไม่พบสินค้า
              </p>
            ) : (
              filtered.map((product) => (
                <label
                  key={product.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(product.id)}
                    onChange={() => toggle(product.id)}
                    className="h-4 w-4 rounded border-slate-300 accent-[#003366]"
                  />
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      width={36}
                      height={36}
                      className="h-9 w-9 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <Package className="h-4.5 w-4.5 text-slate-400" strokeWidth={1.8} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate ${selected.has(product.id) ? "font-medium text-slate-800" : "text-slate-700"}`}>
                      {product.name}
                    </p>
                    <p className="truncate font-mono text-xs text-slate-400">{product.sku}</p>
                    {product.categoryNames.length > 0 ? (
                      <p className="truncate text-xs text-[#003366]">
                        หมวดหมู่: {product.categoryNames.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  {selected.has(product.id) && (
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
