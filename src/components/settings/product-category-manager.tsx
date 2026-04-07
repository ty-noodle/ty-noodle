"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Package2,
  PencilLine,
  Plus,
  Save,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteProductCategory,
  upsertProductCategory,
} from "@/app/dashboard/settings/actions";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelHeader,
  settingsFieldLabelClass,
  settingsInputClass,
} from "@/components/settings/settings-ui";
import type {
  SettingsProduct,
  SettingsProductCategory,
} from "@/lib/settings/admin";

type ProductCategoryManagerProps = {
  categories: SettingsProductCategory[];
  products: SettingsProduct[];
};

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function sortIds(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function ProductCategoryManager({
  categories,
  products,
}: ProductCategoryManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [isCreating, setIsCreating] = useState(categories.length === 0);
  const [draftName, setDraftName] = useState("");
  const [draftProductIds, setDraftProductIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(
    null,
  );
  const [nameModalMode, setNameModalMode] = useState<"create" | "rename" | null>(null);
  const [nameModalValue, setNameModalValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );

  const [prevCategories, setPrevCategories] = useState(categories);
  const [prevSelectedId, setPrevSelectedId] = useState(selectedCategoryId);

  if (categories !== prevCategories || selectedCategoryId !== prevSelectedId) {
    setPrevCategories(categories);
    setPrevSelectedId(selectedCategoryId);

    if (!isCreating) {
      if (!selectedCategoryId && categories[0]) {
        setSelectedCategoryId(categories[0].id);
        setDraftName(categories[0].name);
        setDraftProductIds(categories[0].productIds);
      } else if (selectedCategory) {
        setDraftName(selectedCategory.name);
        setDraftProductIds(selectedCategory.productIds);
      }
    }
  }

  useEffect(() => {
    if (!nameModalMode) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [nameModalMode]);

  const normalizedSearch = productSearch.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    if (!normalizedSearch) return products;

    return products.filter((product) => {
      const haystack = [product.name, product.sku, ...product.categoryNames]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, products]);

  const sortedDraftProductIds = useMemo(() => sortIds(draftProductIds), [draftProductIds]);
  const selectedCategoryProductIds = useMemo(
    () => sortIds(selectedCategory?.productIds ?? []),
    [selectedCategory?.productIds],
  );
  const hasChanges = Boolean(
    selectedCategory
      ? draftName.trim() !== selectedCategory.name ||
          !arraysEqual(sortedDraftProductIds, selectedCategoryProductIds)
      : draftName.trim() || draftProductIds.length,
  );

  function openCreateCategoryModal() {
    setNameModalMode("create");
    setNameModalValue("");
    setFeedback(null);
  }

  function openRenameCategoryModal() {
    setNameModalMode("rename");
    setNameModalValue(draftName);
    setFeedback(null);
  }

  function closeNameModal() {
    setNameModalMode(null);
  }

  function confirmNameModal() {
    const trimmedName = nameModalValue.trim();

    if (!trimmedName) {
      setFeedback({ tone: "error", message: "กรุณาตั้งชื่อหมวดหมู่ก่อนยืนยัน" });
      return;
    }

    if (nameModalMode === "create") {
      setIsCreating(true);
      setSelectedCategoryId(null);
      setDraftProductIds([]);
      setProductSearch("");
    }

    setDraftName(trimmedName);
    setFeedback(null);
    setNameModalMode(null);
  }

  function openCategory(categoryId: string) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;

    setIsCreating(false);
    setSelectedCategoryId(category.id);
    setDraftName(category.name);
    setDraftProductIds(category.productIds);
    setFeedback(null);
  }

  function toggleProduct(productId: string) {
    setDraftProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  function handleSave() {
    const trimmedName = draftName.trim();
    if (!trimmedName) {
      setFeedback({ tone: "error", message: "กรุณาตั้งชื่อหมวดหมู่ก่อนบันทึก" });
      return;
    }

    startTransition(async () => {
      const result = await upsertProductCategory({
        categoryId: selectedCategoryId,
        name: trimmedName,
        productIds: draftProductIds,
      });

      if (!result.success) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({
        tone: "success",
        message: selectedCategoryId ? "บันทึกการเปลี่ยนแปลงหมวดหมู่แล้ว" : "สร้างหมวดหมู่ใหม่แล้ว",
      });
      setIsCreating(false);
      setSelectedCategoryId(result.categoryId);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!selectedCategory) return;

    const isConfirmed = window.confirm(
      `ต้องการลบหมวดหมู่ "${selectedCategory.name}" ใช่หรือไม่`,
    );
    if (!isConfirmed) return;

    startTransition(async () => {
      const result = await deleteProductCategory(selectedCategory.id);

      if (!result.success) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({ tone: "success", message: "ลบหมวดหมู่แล้ว" });
      setIsCreating(categories.length <= 1);
      setSelectedCategoryId(null);
      setDraftName("");
      setDraftProductIds([]);
      setProductSearch("");
      router.refresh();
    });
  }

  return (
    <SettingsPanel className="overflow-hidden rounded-[1.75rem] border border-slate-200 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <SettingsPanelHeader
        title="เพิ่มหมวดหมู่สินค้า"
        description="ตั้งชื่อหมวดหมู่และกำหนดว่าสินค้าใดอยู่ในหมวดนั้น เพื่อให้ค้นหาและคัดกรองสินค้าได้ง่ายขึ้นทุกหน้าที่เกี่ยวข้อง"
        icon="list"
      />

      <SettingsPanelBody className="p-0">
        <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border-b border-slate-100 bg-slate-50/80 p-4 lg:border-b-0 lg:border-r lg:p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                หมวดหมู่ทั้งหมด
              </p>
              <p className="mt-1 text-sm text-slate-500">{categories.length} หมวดหมู่</p>
            </div>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={openCreateCategoryModal}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                  isCreating
                    ? "border-[#003366] bg-white text-[#003366] shadow-[0_12px_28px_rgba(0,51,102,0.12)]"
                    : "border-dashed border-[#003366]/30 bg-white text-slate-700 hover:border-[#003366]/50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold">เพิ่มหมวดหมู่ใหม่</p>
                  <p className="mt-1 text-sm text-slate-400">
                    ตั้งชื่อหมวดหมู่ก่อน แล้วค่อยเลือกสินค้า
                  </p>
                </div>
                <Plus
                  className={`h-5 w-5 shrink-0 ${
                    isCreating ? "text-[#003366]" : "text-slate-300"
                  }`}
                  strokeWidth={2}
                />
              </button>

              {categories.length === 0 ? (
                <SettingsEmptyState className="border-slate-200 bg-white py-8">
                  ยังไม่มีหมวดหมู่สินค้า เริ่มจากปุ่ม <span className="font-semibold">เพิ่มหมวดหมู่ใหม่</span> ด้านบน
                </SettingsEmptyState>
              ) : (
                categories.map((category) => {
                  const isActive = !isCreating && category.id === selectedCategoryId;

                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => openCategory(category.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                        isActive
                          ? "border-[#003366] bg-white text-[#003366] shadow-[0_12px_28px_rgba(0,51,102,0.12)]"
                          : "border-transparent bg-white text-slate-700 hover:border-slate-200"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold">{category.name}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          {category.productCount} สินค้า
                        </p>
                      </div>
                      <Tag
                        className={`h-5 w-5 shrink-0 ${
                          isActive ? "text-[#003366]" : "text-slate-300"
                        }`}
                        strokeWidth={2}
                      />
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <div className="min-w-0 bg-white p-4 lg:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  ตั้งค่าหมวดหมู่
                </p>
                <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                  {draftName || "หมวดหมู่ใหม่"}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {draftName
                    ? "เลือกสินค้าเข้าในหมวดนี้ได้หลายรายการ และกลับมาแก้ไขได้ทุกเมื่อ"
                    : "เริ่มจากกดปุ่มเพิ่มหมวดหมู่ใหม่ แล้วตั้งชื่อหมวดหมู่ก่อน"}
                </p>
                {isCreating ? (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#eef4fa] px-3 py-1.5 text-sm font-semibold text-[#003366]">
                    <Plus className="h-4 w-4" strokeWidth={2.2} />
                    กำลังสร้างหมวดหมู่ใหม่
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={draftName ? openRenameCategoryModal : openCreateCategoryModal}
                  disabled={isPending}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <PencilLine className="h-4 w-4" strokeWidth={2.1} />
                  {draftName ? "แก้ชื่อหมวดหมู่" : "ตั้งชื่อหมวดหมู่"}
                </button>
                {selectedCategory ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isPending}
                    className="inline-flex h-11 items-center gap-2 rounded-2xl border border-rose-200 px-4 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2.1} />
                    ลบหมวดหมู่
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isPending || !hasChanges || !draftName.trim()}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#003366] px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(0,51,102,0.18)] transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Save className="h-4 w-4" strokeWidth={2.2} />
                  {isPending ? "กำลังบันทึก..." : "บันทึกหมวดหมู่"}
                </button>
              </div>
            </div>

            {feedback ? (
              <div
                className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-medium ${
                  feedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {feedback.message}
              </div>
            ) : null}

            <div className="mt-6">
              <section className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <p className="text-sm font-semibold text-slate-900">เลือกสินค้าในหมวดหมู่</p>
                  <p className="mt-1 text-sm text-slate-500">
                    ติ๊กเลือกสินค้าได้หลายรายการ และค้นหาได้ทั้งชื่อสินค้า รหัสสินค้า และชื่อหมวดเดิมของสินค้า
                  </p>
                </div>

                <div className="border-b border-slate-100 px-5 py-4">
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <Search className="h-4.5 w-4.5 shrink-0 text-slate-400" strokeWidth={2} />
                    <input
                      value={productSearch}
                      onChange={(event) => setProductSearch(event.target.value)}
                      placeholder="ค้นหาสินค้า รหัสสินค้า หรือหมวดหมู่"
                      className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="max-h-[34rem] overflow-y-auto px-3 py-3">
                  {!draftName.trim() ? (
                    <SettingsEmptyState className="border-slate-200 bg-slate-50 py-12">
                      ตั้งชื่อหมวดหมู่ก่อน แล้วค่อยเลือกสินค้า
                    </SettingsEmptyState>
                  ) : filteredProducts.length === 0 ? (
                    <SettingsEmptyState className="border-slate-200 bg-slate-50 py-12">
                      ไม่พบสินค้าในคำค้นนี้
                    </SettingsEmptyState>
                  ) : (
                    <div className="space-y-2">
                      {filteredProducts.map((product) => {
                        const isSelected = draftProductIds.includes(product.id);
                        // สินค้าอยู่หมวดอื่นอยู่แล้ว (ไม่ใช่หมวดที่กำลังแก้ไข)
                        const otherCategoryName =
                          product.categoryIds.length > 0 &&
                          !product.categoryIds.includes(selectedCategoryId ?? "")
                            ? product.categoryNames[0]
                            : null;
                        const isDisabled = Boolean(otherCategoryName);

                        return (
                          <label
                            key={product.id}
                            className={`flex items-center gap-4 rounded-2xl border px-4 py-3 transition ${
                              isDisabled
                                ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50"
                                : isSelected
                                  ? "cursor-pointer border-[#003366] bg-[#eef4fa]"
                                  : "cursor-pointer border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isDisabled}
                              onChange={() => !isDisabled && toggleProduct(product.id)}
                              className="h-5 w-5 rounded border-slate-300 accent-[#003366] disabled:cursor-not-allowed"
                            />

                            {product.imageUrls[0] ? (
                              <Image
                                src={product.imageUrls[0]}
                                alt={product.name}
                                width={52}
                                height={52}
                                className="h-13 w-13 shrink-0 rounded-xl object-cover"
                              />
                            ) : (
                              <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                                <Package2 className="h-5 w-5 text-slate-400" strokeWidth={1.8} />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base font-semibold text-slate-900">
                                {product.name}
                              </p>
                              <p className="mt-1 text-sm text-slate-400">{product.sku}</p>
                              {otherCategoryName ? (
                                <p className="mt-1 truncate text-xs font-medium text-slate-400">
                                  อยู่ในหมวด: {otherCategoryName} แล้ว
                                </p>
                              ) : isSelected ? (
                                <p className="mt-1 text-xs font-medium text-[#003366]">
                                  ✓ เลือกอยู่ในหมวดนี้
                                </p>
                              ) : null}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </SettingsPanelBody>

      {nameModalMode ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="absolute inset-0" onClick={closeNameModal} aria-hidden="true" />
          <div className="relative w-full max-w-md rounded-[1.75rem] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  หมวดหมู่สินค้า
                </p>
                <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                  {nameModalMode === "create" ? "เพิ่มหมวดหมู่ใหม่" : "แก้ชื่อหมวดหมู่"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {nameModalMode === "create"
                    ? "ตั้งชื่อหมวดหมู่ก่อน แล้วค่อยเลือกสินค้าที่ต้องการให้อยู่ในหมวดนี้"
                    : "เปลี่ยนชื่อหมวดหมู่ให้ชัดเจนและค้นหาได้ง่ายขึ้น"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeNameModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" strokeWidth={2.2} />
              </button>
            </div>

            <div className="px-6 py-6">
              <label className={settingsFieldLabelClass} htmlFor="category-name-modal">
                ชื่อหมวดหมู่
              </label>
              <input
                ref={nameInputRef}
                id="category-name-modal"
                value={nameModalValue}
                onChange={(event) => setNameModalValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirmNameModal();
                  }
                }}
                className={settingsInputClass}
                placeholder="เช่น กลุ่มเส้นเล็ก หรือ เต้าหู้"
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-5">
              <button
                type="button"
                onClick={closeNameModal}
                className="inline-flex h-11 items-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmNameModal}
                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#003366] px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(0,51,102,0.18)] transition hover:bg-[#002244]"
              >
                <Save className="h-4 w-4" strokeWidth={2.2} />
                ยืนยันชื่อหมวดหมู่
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SettingsPanel>
  );
}
