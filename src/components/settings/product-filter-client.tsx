"use client";

import { useMemo, useState } from "react";
import { Boxes, FolderTree, ImageOff, Search, Tags, TrendingUp } from "lucide-react";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { useMobileSearch } from "@/components/mobile-search/mobile-search-context";
import { normalizeSearch } from "@/lib/utils/search";
import { ProductList } from "@/components/settings/product-list";
import type { SettingsProduct, SettingsProductCategory } from "@/lib/settings/admin";

type ProductFilterClientProps = {
  allProducts: SettingsProduct[];
  categories: SettingsProductCategory[];
  baseListHref: string;
};

type QuickFilterMode = "all" | "missing-image" | "uncategorized";

function hasImage(product: SettingsProduct) {
  return product.imageUrls.some((url) => url.trim().length > 0);
}

export function ProductFilterClient({
  allProducts,
  categories,
  baseListHref,
}: ProductFilterClientProps) {
  const { close } = useMobileSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilterMode>("all");

  const counts = useMemo(() => {
    const productCount = allProducts.length;
    const categoryCount = categories.length;
    const missingImageCount = allProducts.filter((product) => !hasImage(product)).length;
    const uncategorizedCount = allProducts.filter((product) => product.categoryIds.length === 0).length;
    return { productCount, categoryCount, missingImageCount, uncategorizedCount };
  }, [allProducts, categories.length]);

  const filteredProducts = useMemo(() => {
    return allProducts.filter((product) => {
      if (quickFilter === "missing-image" && hasImage(product)) return false;
      if (quickFilter === "uncategorized" && product.categoryIds.length > 0) return false;

      const matchesCategory = !categoryFilter || product.categoryIds.includes(categoryFilter);
      if (!matchesCategory) return false;

      if (!searchQuery) return true;
      const normalized = normalizeSearch(searchQuery);
      return (
        normalizeSearch(product.name).includes(normalized) ||
        normalizeSearch(product.sku).includes(normalized) ||
        product.categoryNames.some((name) => normalizeSearch(name).includes(normalized))
      );
    });
  }, [allProducts, categoryFilter, quickFilter, searchQuery]);

  const kpis = useMemo(() => {
    return [
      {
        key: "product-count",
        icon: Boxes,
        label: "สินค้าทั้งหมด",
        value: counts.productCount,
        accentClassName: "bg-[#003366]",
        trendLabel: "คงที่",
        trendClassName: "text-slate-500",
      },
      {
        key: "category-count",
        icon: FolderTree,
        label: "หมวดหมู่ทั้งหมด",
        value: counts.categoryCount,
        accentClassName: "bg-sky-600",
        trendLabel: "คงที่",
        trendClassName: "text-slate-500",
      },
      {
        key: "missing-image",
        icon: ImageOff,
        label: "สินค้าไม่มีรูป",
        value: counts.missingImageCount,
        accentClassName: "bg-amber-500",
        trendLabel: counts.missingImageCount > 0 ? "ต้องจัดการ" : "พร้อมใช้งาน",
        trendClassName: counts.missingImageCount > 0 ? "text-amber-700" : "text-emerald-700",
      },
      {
        key: "uncategorized",
        icon: Tags,
        label: "สินค้าไม่อยู่ในหมวดหมู่",
        value: counts.uncategorizedCount,
        accentClassName: "bg-violet-600",
        trendLabel: counts.uncategorizedCount > 0 ? "ต้องจัดการ" : "พร้อมใช้งาน",
        trendClassName: counts.uncategorizedCount > 0 ? "text-violet-700" : "text-emerald-700",
      },
    ] as const;
  }, [counts]);

  function activateQuickFilter(mode: QuickFilterMode) {
    setQuickFilter(mode);
    setSearchQuery("");
    setCategoryFilter("");
    window.requestAnimationFrame(() => {
      document.getElementById("product-list-anchor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function handleClear() {
    setSearchQuery("");
    setCategoryFilter("");
    setQuickFilter("all");
  }

  return (
    <>
      <section className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon;
          const isMissingImageCard = item.key === "missing-image";
          const isUncategorizedCard = item.key === "uncategorized";
          const showAction = isMissingImageCard || isUncategorizedCard;
          const isActive =
            (isMissingImageCard && quickFilter === "missing-image") ||
            (isUncategorizedCard && quickFilter === "uncategorized");

          const actionLabel = isMissingImageCard ? "ดูรายการ" : "จัดหมวดหมู่";
          const onAction = isMissingImageCard
            ? () => activateQuickFilter("missing-image")
            : () => activateQuickFilter("uncategorized");
          const disableAction = isMissingImageCard
            ? counts.missingImageCount === 0
            : counts.uncategorizedCount === 0;

          return (
            <article
              key={item.key}
              className="relative flex min-h-[148px] flex-col rounded-none border border-slate-200 bg-white px-2.5 py-2 shadow-[0_6px_18px_rgba(15,23,42,0.08)] sm:min-h-[156px] sm:px-3 sm:py-2.5"
            >
              <div className={`absolute left-0 top-0 h-[3px] w-full ${item.accentClassName}`} />

              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-[#003366] sm:h-5 sm:w-5" strokeWidth={2.2} />
                  <p className="whitespace-nowrap text-[13px] font-bold leading-tight text-slate-700 xs:text-sm sm:text-base">
                    {item.label}
                  </p>
                </div>
                
                {/* Desktop Trend Label */}
                <span
                  className={`absolute right-2.5 top-2.5 hidden items-center gap-1 text-xs font-semibold sm:inline-flex ${item.trendClassName}`}
                >
                  <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.4} />
                  {item.trendLabel}
                </span>
              </div>

              <p className="mt-2 text-center text-[36px] font-bold leading-none tabular-nums text-[#003366] sm:mt-3 sm:text-[40px]">
                {item.value.toLocaleString("th-TH")}
              </p>

              {/* Mobile Trend Label - Positioned bottom right */}
              <span
                className={`absolute bottom-2 right-2.5 inline-flex items-center gap-1 text-[10px] font-bold sm:hidden ${item.trendClassName} rounded-md border border-current/10 bg-white/60 px-1.5 py-0.5 backdrop-blur-[2px]`}
              >
                <TrendingUp className="h-3 w-3" strokeWidth={2.6} />
                {item.trendLabel}
              </span>

              {showAction ? (
                <div className="mt-auto pt-2">
                  <button
                    type="button"
                    onClick={onAction}
                    disabled={disableAction}
                    className={`inline-flex items-center rounded-none border px-2.5 py-1.5 text-[11px] font-semibold transition sm:text-xs ${
                      isActive
                        ? "border-[#003366] bg-[#003366] text-white"
                        : "border-slate-300 text-[#003366] hover:bg-[#003366]/5"
                    } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}
                  >
                    {actionLabel}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      {quickFilter !== "all" ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-none border border-[#003366]/20 bg-[#003366]/5 px-3 py-2">
          <p className="text-xs font-semibold text-[#003366] sm:text-sm">
            {quickFilter === "missing-image"
              ? "กำลังแสดงเฉพาะสินค้าไม่มีรูป"
              : "กำลังแสดงเฉพาะสินค้าไม่อยู่ในหมวดหมู่"}
          </p>
          <button
            type="button"
            onClick={() => setQuickFilter("all")}
            className="rounded-none border border-[#003366]/30 bg-white px-2 py-1 text-[11px] font-semibold text-[#003366] transition hover:bg-[#003366]/10"
          >
            แสดงทั้งหมด
          </button>
        </div>
      ) : null}

      <div className="mb-4 hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:block">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">ค้นหาสินค้า</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Search className="h-4.5 w-4.5 text-slate-400" strokeWidth={2} />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="ชื่อสินค้า หรือรหัสสินค้า"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">หมวดหมู่</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none"
            >
              <option value="">ทุกหมวดหมู่</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleClear}
              className="action-touch-safe w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              ล้างตัวกรอง
            </button>
          </div>
        </div>
      </div>

      <MobileSearchDrawer title="ค้นหาสินค้า">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">ค้นหาสินค้า</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Search className="h-4 w-4 text-slate-400" strokeWidth={2} />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="ชื่อสินค้า หรือรหัสสินค้า"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">หมวดหมู่</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none"
            >
              <option value="">ทุกหมวดหมู่</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="action-touch-safe w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600"
            >
              ล้างตัวกรอง
            </button>
            <button
              type="button"
              onClick={close}
              className="action-touch-safe w-full rounded-xl bg-[#003366] px-4 py-2.5 text-sm font-semibold text-white"
            >
              แสดงผล
            </button>
          </div>
        </div>
      </MobileSearchDrawer>

      <div id="product-list-anchor" />
      <ProductList products={filteredProducts} baseListHref={baseListHref} />
    </>
  );
}
