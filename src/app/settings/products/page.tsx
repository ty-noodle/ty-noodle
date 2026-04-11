import Link from "next/link";
import { FolderTree, Package2 } from "lucide-react";
import { ProductCategoryManager } from "@/components/settings/product-category-manager";
import { ProductFilterClient } from "@/components/settings/product-filter-client";
import { ProductForm } from "@/components/settings/product-form";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSettingsProductsData } from "@/lib/settings/admin";

export const metadata = {
  title: "จัดการสินค้า",
};

type SettingsProductsPageProps = {
  searchParams: Promise<{
    create?: string;
    edit?: string;
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
          <ProductFilterClient
            allProducts={data.products}
            categories={data.productCategories}
            baseListHref="/settings/products"
          />
          {shouldShowForm ? (
            <ProductForm
              categories={data.productCategories}
              editingProduct={editingProduct}
              nextSku={data.nextProductSku}
              productList={data.products}
              returnHref="/settings/products"
            />
          ) : null}
        </>
      )}
    </SettingsShell>
  );
}
