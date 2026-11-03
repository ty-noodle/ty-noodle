"use client";

import { useMemo, useState } from "react";
import { Check, ListFilter, Tags, X } from "lucide-react";

type CategoryOption = {
  id: string;
  name: string;
};

type CatalogCategoryDrawerProps = {
  categories: CategoryOption[];
  onSelectCategory: (categoryId: string) => void;
  selectedCategory: string;
};

export function CatalogCategoryDrawer({
  categories,
  onSelectCategory,
  selectedCategory,
}: CatalogCategoryDrawerProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = useMemo(() => {
    if (selectedCategory === "all") return "หมวดหมู่";
    return categories.find((category) => category.id === selectedCategory)?.name ?? "หมวดหมู่";
  }, [categories, selectedCategory]);

  function selectCategory(categoryId: string) {
    onSelectCategory(categoryId);
    setOpen(false);
  }

  if (categories.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#003366] px-3 text-[13px] font-bold text-white shadow-[0_7px_16px_rgba(0,51,102,0.2)] transition active:scale-[0.98]"
      >
        <ListFilter className="h-4 w-4" strokeWidth={2.3} />
        <span className="max-w-[4.8rem] truncate">{selectedLabel}</span>
      </button>

      <button
        type="button"
        aria-label="ปิดหมวดหมู่"
        tabIndex={open ? 0 : -1}
        className={`fixed inset-0 z-[88] cursor-default bg-slate-950/35 backdrop-blur-[1px] transition-opacity duration-200 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
      />

      <aside
        role="dialog"
        aria-label="เลือกหมวดหมู่"
        aria-hidden={!open}
        className={`fixed inset-x-0 bottom-0 z-[90] flex max-h-[min(82dvh,40rem)] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-slate-200 bg-white shadow-[0_-24px_70px_rgba(15,23,42,0.24)] transition-transform duration-250 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-center pt-2">
          <div className="h-1.5 w-12 rounded-full bg-slate-200" />
        </div>

        <div className="flex items-center justify-between border-b border-slate-100 px-4 pb-3 pt-2.5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#003366]/10 text-[#003366] ring-1 ring-[#003366]/10">
              <Tags className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="text-base font-extrabold leading-tight text-slate-950">หมวดหมู่</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-400">เลือกประเภทสินค้าที่ต้องการ</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="ปิดหมวดหมู่"
            tabIndex={open ? 0 : -1}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100"
          >
            <X className="h-5 w-5" strokeWidth={2.3} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[max(5.75rem,calc(env(safe-area-inset-bottom)+5.25rem))]">
          <div className="grid grid-cols-3 gap-2">
            <CategoryButton
              active={selectedCategory === "all"}
              label="ทั้งหมด"
              onClick={() => selectCategory("all")}
              tabIndex={open ? 0 : -1}
            />
            {categories.map((category) => (
              <CategoryButton
                key={category.id}
                active={selectedCategory === category.id}
                label={category.name}
                onClick={() => selectCategory(category.id)}
                tabIndex={open ? 0 : -1}
              />
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

function CategoryButton({
  active,
  label,
  onClick,
  tabIndex,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tabIndex: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={tabIndex}
      className={`flex min-h-11 items-center justify-between gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[13px] font-bold transition active:scale-[0.98] ${
        active
          ? "border-[#003366]/20 bg-[#003366]/10 text-[#003366]"
          : "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-[#003366]/20 hover:bg-slate-50"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? <Check className="h-4 w-4 shrink-0" strokeWidth={2.4} /> : null}
    </button>
  );
}
