import Link from "next/link";
import { FolderTree, Package2, Search } from "lucide-react";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { ProductCategoryManager } from "@/components/settings/product-category-manager";
import { ProductForm } from "@/components/settings/product-form";
import { ProductList } from "@/components/settings/product-list";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSettingsProductsData } from "@/lib/settings/admin";

export const metadata = {
  title: "จัดการสินค้า",
};

type SettingsProductsPageProps = {
  searchParams: Promise<{
    category?: string;
    create?: string;
    edit?: string;
    q?: string;
    tab?: string;
  }>;
};

export default async function SettingsProductsPage({
  searchParams,
}: SettingsProductsPageProps) {
  const session = await requireAppRole("admin");
  const data = await getSettingsProductsData(session.organizationId);
  const params = await searchParams;
  const activeTab =
    params.tab === "categories" && params.create !== "1" && !params.edit
      ? "categories"
      : "products";
  const editingProduct = data.products.find((product) => product.id === params.edit) ?? null;
  const shouldShowForm =
    activeTab === "products" && (params.create === "1" || editingProduct !== null);
  const searchQuery = (params.q ?? "").trim();
  const categoryFilter = (params.category ?? "").trim();

  const filteredProducts = data.products.filter((product) => {
    const matchesCategory = !categoryFilter || product.categoryIds.includes(categoryFilter);
    if (!matchesCategory) return false;

    if (!searchQuery) return true;
    const normalized = searchQuery.toLowerCase();
    return (
      product.name.toLowerCase().includes(normalized) ||
      product.sku.toLowerCase().includes(normalized) ||
      product.categoryNames.some((categoryName) => categoryName.toLowerCase().includes(normalized))
    );
  });

  const listQuery = new URLSearchParams();
  if (searchQuery) listQuery.set("q", searchQuery);
  if (categoryFilter) listQuery.set("category", categoryFilter);
  const listHref = listQuery.size > 0 ? `/settings/products?${listQuery.toString()}` : "/settings/products";

  return (
    <SettingsShell
      current="products"
      title="จัดการสินค้า"
      titleIcon={Package2}
      description="เพิ่มสินค้าใหม่ อัปเดตรหัสสินค้า รูปสินค้า ต้นทุน และจัดกลุ่มหมวดหมู่เพื่อให้ค้นหาใช้งานง่ายขึ้น"
      floatingSubmit={false}
    >
      {data.setupHint ? (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {data.setupHint} กรุณารัน migration `202603160004_catalog_settings.sql`,
          `202603160005_product_inventory_fields.sql` และ
          `202604051200_product_categories.sql` ก่อนใช้งานหน้านี้
        </div>
      ) : null}

      <div className="mb-6 inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
        <Link
          href="/settings/products"
          scroll={false}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "products"
              ? "bg-[#003366] text-white shadow-[0_10px_24px_rgba(0,51,102,0.18)]"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Package2 className="h-4 w-4" strokeWidth={2.1} />
          จัดการสินค้า
        </Link>
        <Link
          href="/settings/products?tab=categories"
          scroll={false}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "categories"
              ? "bg-[#003366] text-white shadow-[0_10px_24px_rgba(0,51,102,0.18)]"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <FolderTree className="h-4 w-4" strokeWidth={2.1} />
          เพิ่มหมวดหมู่
        </Link>
      </div>

      {activeTab === "categories" ? (
        <ProductCategoryManager categories={data.productCategories} products={data.products} />
      ) : (
        <>
          <div className="mb-4 hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:block">
            <form method="get" className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
              <input type="hidden" name="tab" value="products" />
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">ค้นหาสินค้า</span>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <Search className="h-4.5 w-4.5 text-slate-400" strokeWidth={2} />
                  <input
                    type="search"
                    name="q"
                    defaultValue={searchQuery}
                    placeholder="ชื่อสินค้า หรือรหัสสินค้า"
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">หมวดหมู่</span>
                <select
                  name="category"
                  defaultValue={categoryFilter}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none"
                >
                  <option value="">ทุกหมวดหมู่</option>
                  {data.productCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className="action-touch-safe rounded-xl bg-[#003366] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#002244]"
              >
                ค้นหา
              </button>
              <Link
                href="/settings/products"
                scroll={false}
                className="action-touch-safe inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                ล้างตัวกรอง
              </Link>
            </form>
          </div>

          <MobileSearchDrawer title="ค้นหาสินค้า">
            <form method="get" className="space-y-3">
              <input type="hidden" name="tab" value="products" />

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">ค้นหาสินค้า</span>
                <input
                  type="search"
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="ชื่อสินค้า หรือรหัสสินค้า"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">หมวดหมู่</span>
                <select
                  name="category"
                  defaultValue={categoryFilter}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none"
                >
                  <option value="">ทุกหมวดหมู่</option>
                  {data.productCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="submit"
                  className="action-touch-safe rounded-xl bg-[#003366] px-4 py-2.5 text-sm font-semibold text-white"
                >
                  ค้นหา
                </button>
                <Link
                  href="/settings/products"
                  scroll={false}
                  className="action-touch-safe inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600"
                >
                  ล้างตัวกรอง
                </Link>
              </div>
            </form>
          </MobileSearchDrawer>

          <ProductList products={filteredProducts} baseListHref={listHref} />
          {shouldShowForm ? (
            <ProductForm
              categories={data.productCategories}
              editingProduct={editingProduct}
              nextSku={data.nextProductSku}
              returnHref={listHref}
            />
          ) : null}
        </>
      )}
    </SettingsShell>
  );
}
