"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { normalizeSearch } from "@/lib/utils/search";
import { ProductList } from "@/components/settings/product-list";
import type { SettingsProduct, SettingsProductCategory } from "@/lib/settings/admin";

type ProductFilterClientProps = {
  allProducts: SettingsProduct[];
  categories: SettingsProductCategory[];
  baseListHref: string;
};

export function ProductFilterClient({
  allProducts,
  categories,
  baseListHref,
}: ProductFilterClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const filteredProducts = useMemo(() => {
    return allProducts.filter((product) => {
      const matchesCategory = !categoryFilter || product.categoryIds.includes(categoryFilter);
      if (!matchesCategory) return false;

      if (!searchQuery) return true;
      const normalized = normalizeSearch(searchQuery);
      return (
        normalizeSearch(product.name).includes(normalized) ||
        normalizeSearch(product.sku).includes(normalized) ||
        product.categoryNames.some((n) => normalizeSearch(n).includes(normalized))
      );
    });
  }, [allProducts, searchQuery, categoryFilter]);

  function handleClear() {
    setSearchQuery("");
    setCategoryFilter("");
  }

  return (
    <>
      {/* Desktop search bar */}
      <div className="mb-4 hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:block">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">ค้นหาสินค้า</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Search className="h-4.5 w-4.5 text-slate-400" strokeWidth={2} />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ชื่อสินค้า หรือรหัสสินค้า"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">หมวดหมู่</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
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

      {/* Mobile search drawer replacement — inline panel */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:hidden">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">ค้นหาสินค้า</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Search className="h-4 w-4 text-slate-400" strokeWidth={2} />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ชื่อสินค้า หรือรหัสสินค้า"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">หมวดหมู่</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
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

          {(searchQuery || categoryFilter) && (
            <button
              type="button"
              onClick={handleClear}
              className="action-touch-safe w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      <ProductList products={filteredProducts} baseListHref={baseListHref} />
    </>
  );
}
