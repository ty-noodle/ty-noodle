"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  ClipboardList,
  History,
  Loader2,
  Minus,
  Package2,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import type { OrderCustomerOption, OrderProductOption } from "@/lib/orders/manage";
import {
  createManualOrderAction,
  fetchCustomerYesterdayItemsAction,
  fetchCustomerPricesAction,
  type CustomerYesterdaySnapshot,
} from "@/app/orders/incoming/actions";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

type CartItem = {
  productId: string;
  productName: string;
  quantity: number;
  saleUnitBaseQty: number;
  saleUnitId: string | null;
  saleUnitLabel: string;
  unitPrice: number;
};

type ProductUnit = {
  baseUnitQuantity: number;
  id: string | null;
  isDefault: boolean;
  label: string;
};

type ProductSelectModalProps = {
  cart: CartItem[];
  noCustomer: boolean;
  onClose: () => void;
  onConfirm: (
    product: OrderProductOption,
    unitId: string | null,
    unitLabel: string,
    baseQty: number,
    quantity: number,
    unitPrice: number,
  ) => void;
  open: boolean;
  priceMap: Record<string, number>;
  products: OrderProductOption[];
  productsLoading: boolean;
};

type Props = {
  customers: OrderCustomerOption[];
  products: OrderProductOption[];
  today: string;
};

type ModalTab = "create" | "history";

function formatTHB(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatThaiShortDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) {
    return isoDate;
  }
  return `${day}/${month}/${Number(year) + 543}`;
}

function getUnits(product: OrderProductOption): ProductUnit[] {
  if (product.saleUnits.length > 0) {
    return product.saleUnits.map((unit) => ({
      baseUnitQuantity: unit.baseUnitQuantity,
      id: unit.id,
      isDefault: unit.isDefault,
      label: unit.label,
    }));
  }
  return [{ baseUnitQuantity: 1, id: null, isDefault: true, label: product.unit }];
}

function getUnitPrice(productId: string, unitId: string | null, priceMap: Record<string, number>) {
  return priceMap[unitId ?? productId] ?? priceMap[productId] ?? 0;
}

function ProductSelectModal({
  cart,
  noCustomer,
  onClose,
  onConfirm,
  open,
  priceMap,
  products,
  productsLoading,
}: ProductSelectModalProps) {
  const [query, setQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("__all__");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [priceInput, setPriceInput] = useState("0");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  // Products are pre-sorted by category sort_order at the data layer.
  // Iterate in order to collect categories by first appearance → preserves sort_order without
  // needing to pass categories separately.
  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>(); // id → name, insertion order = category sort_order
    for (const product of products) {
      for (let i = 0; i < product.categoryIds.length; i++) {
        const id = product.categoryIds[i];
        const name = product.categoryNames[i];
        if (id && name && !seen.has(id)) seen.set(id, name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        selectedCategoryId === "__all__" || product.categoryIds.includes(selectedCategoryId);

      if (!matchesCategory) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      return (
        product.name.toLowerCase().includes(normalized) ||
        product.sku.toLowerCase().includes(normalized) ||
        product.categoryNames.some((categoryName) =>
          categoryName.toLowerCase().includes(normalized),
        )
      );
    });
  }, [products, query, selectedCategoryId]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) ?? null,
    [products, selectedId],
  );
  const selectedUnits = useMemo(
    () => (selectedProduct ? getUnits(selectedProduct) : []),
    [selectedProduct],
  );
  const selectedUnit =
    selectedUnits.find((unit) => unit.id === selectedUnitId) ?? selectedUnits[0] ?? null;

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setQuery("");
      setSelectedCategoryId("__all__");
      setSelectedId(null);
      setSelectedUnitId(null);
      setQuantityInput("1");
      setPriceInput("0");
      setMobileView("list");
    }
  }

  const [prevSelectedIdSync, setPrevSelectedIdSync] = useState(selectedId);
  const [prevPriceMap, setPrevPriceMap] = useState(priceMap);
  if (selectedId !== prevSelectedIdSync || priceMap !== prevPriceMap) {
    setPrevSelectedIdSync(selectedId);
    setPrevPriceMap(priceMap);
    if (selectedProduct) {
      const defaultUnit = selectedUnits.find((unit) => unit.isDefault) ?? selectedUnits[0] ?? null;
      if (defaultUnit) {
        setSelectedUnitId(defaultUnit.id);
        setQuantityInput("1");
        setPriceInput(String(getUnitPrice(selectedProduct.id, defaultUnit.id, priceMap)));
      }
    }
  }

  function getAddedCount(productId: string) {
    return cart
      .filter((item) => item.productId === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  }

  function handleSelectProduct(id: string) {
    setSelectedId(id);
    setMobileView("detail");
  }

  function handleUnitChange(value: string) {
    if (!selectedProduct) return;
    const nextUnitId = value === "__default__" ? null : value;
    setSelectedUnitId(nextUnitId);
    setPriceInput(String(getUnitPrice(selectedProduct.id, nextUnitId, priceMap)));
  }

  function handleConfirm() {
    if (!selectedProduct || !selectedUnit) return;
    const quantity = Number(quantityInput);
    const unitPrice = Number(priceInput);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return;
    onConfirm(
      selectedProduct,
      selectedUnit.id,
      selectedUnit.label,
      selectedUnit.baseUnitQuantity,
      quantity,
      unitPrice,
    );
    setMobileView("list");
    setSelectedId(null);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 lg:items-center lg:p-6">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative flex h-[95dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl lg:h-[85dvh] lg:rounded-[2rem]">
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
          {mobileView === "detail" && (
            <button
              type="button"
              onClick={() => setMobileView("list")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition active:scale-95 lg:hidden"
              aria-label="กลับไปรายการสินค้า"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-950">
              {mobileView === "detail" && selectedProduct
                ? selectedProduct.name
                : "เลือกรายการสินค้า"}
            </h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {mobileView === "detail"
                ? "กำหนดจำนวนและราคา แล้วกดเพิ่มสินค้า"
                : "เลือกจากสินค้าทั้งหมด หรือกรองตามหมวดหมู่"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 active:scale-95"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <div className="min-h-0 flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <div
            className={`${
              mobileView === "detail" ? "hidden lg:flex" : "flex"
            } min-h-0 flex-1 flex-col border-b border-slate-200 lg:border-r lg:border-b-0`}
          >
            <div className="shrink-0 border-b border-slate-100 px-4 py-3">
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId("__all__")}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    selectedCategoryId === "__all__"
                      ? "border-[#003366] bg-[#003366] text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-[#003366]/30 hover:text-[#003366]"
                  }`}
                >
                  ทุกหมวดหมู่
                </button>
                {categoryOptions.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(category.id)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      selectedCategoryId === category.id
                        ? "border-[#003366] bg-[#003366] text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-[#003366]/30 hover:text-[#003366]"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition focus-within:border-[#003366]/60 focus-within:ring-2 focus-within:ring-[#003366]/10">
                <Search className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ค้นหาชื่อสินค้า SKU หรือหมวดหมู่"
                  className="min-w-0 flex-1 bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400"
                  disabled={productsLoading}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-slate-400 transition hover:text-slate-600"
                    aria-label="ล้างคำค้น"
                  >
                    <X className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                )}
              </div>
              {noCustomer ? (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  เลือกลูกค้าก่อนเพื่อดึงราคาตามร้านค้า แต่สามารถดูสินค้าและเลือกหมวดหมู่ได้ทันที
                </p>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {productsLoading ? (
                <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-[#003366]/50" strokeWidth={2} />
                  <p className="text-base font-medium text-slate-500">กำลังโหลดรายการสินค้า...</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                  <Package2 className="h-9 w-9 text-slate-300" strokeWidth={1.8} />
                  <p className="mt-3 text-base font-medium text-slate-500">
                    {query || selectedCategoryId !== "__all__"
                      ? "ไม่พบสินค้าที่ตรงกับเงื่อนไขที่เลือก"
                      : "ยังไม่มีสินค้าให้เลือก"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredProducts.map((product) => {
                    const isSelected = product.id === selectedId;
                    const addedCount = getAddedCount(product.id);
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleSelectProduct(product.id)}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] ${
                          isSelected
                            ? "border-[#003366] bg-[#003366]/5"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt={product.name}
                              fill
                              className="object-cover"
                              sizes="48px"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Package2 className="h-6 w-6 text-slate-400" strokeWidth={1.9} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-base font-semibold leading-snug text-slate-900">
                              {product.name}
                            </p>
                            {addedCount > 0 && (
                              <span className="shrink-0 rounded-full bg-[#003366] px-2.5 py-0.5 text-xs font-bold text-white">
                                +{addedCount}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {product.sku} · สต็อก {product.stockQuantity.toLocaleString("th-TH")} {product.unit}
                          </p>
                          {product.categoryNames.length > 0 ? (
                            <p className="mt-1 text-xs font-medium text-[#003366]">
                              หมวดหมู่: {product.categoryNames.join(", ")}
                            </p>
                          ) : null}
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 lg:hidden" strokeWidth={2} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div
            className={`${
              mobileView === "list" ? "hidden lg:flex" : "flex"
            } min-h-0 flex-1 flex-col bg-slate-50/40`}
          >
            {!selectedProduct || !selectedUnit ? (
              <div className="hidden flex-1 items-center justify-center p-8 text-center lg:flex">
                <div>
                  <Package2 className="mx-auto h-10 w-10 text-slate-300" strokeWidth={1.6} />
                  <p className="mt-3 text-base font-medium text-slate-400">
                    เลือกสินค้าจากรายการด้านซ้าย
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                        {selectedProduct.imageUrl ? (
                          <Image
                            src={selectedProduct.imageUrl}
                            alt={selectedProduct.name}
                            fill
                            className="object-cover"
                            sizes="80px"
                            priority
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package2 className="h-8 w-8 text-slate-400" strokeWidth={1.8} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold leading-snug text-slate-950">
                          {selectedProduct.name}
                        </p>
                        <p className="mt-1.5 text-sm text-slate-500">
                          {selectedProduct.sku} · สต็อกคงเหลือ{" "}
                          <span className="font-semibold text-slate-700">
                            {selectedProduct.stockQuantity.toLocaleString("th-TH")}
                          </span>{" "}
                          {selectedProduct.unit}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-base font-semibold text-slate-700">
                      หน่วยสินค้า
                    </label>
                    <select
                      value={selectedUnit.id ?? "__default__"}
                      onChange={(e) => handleUnitChange(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base text-slate-800 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                    >
                      {selectedUnits.map((unit) => (
                        <option key={unit.id ?? "__default__"} value={unit.id ?? "__default__"}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-base font-semibold text-slate-700">จำนวน</label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setQuantityInput((current) => String(Math.max(1, Number(current || "1") - 1)))
                        }
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
                      >
                        <Minus className="h-5 w-5" strokeWidth={2.5} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={quantityInput}
                        onChange={(e) => setQuantityInput(e.target.value)}
                        className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 text-center text-2xl font-bold text-slate-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setQuantityInput((current) => String(Math.max(1, Number(current || "0") + 1)))
                        }
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
                      >
                        <Plus className="h-5 w-5" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-base font-semibold text-slate-700">
                      ราคาต่อหน่วย (บาท)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 pr-14 text-right text-2xl font-bold text-slate-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
                        บาท
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#003366]/15 bg-[#003366]/5 px-4 py-4">
                    <p className="text-sm font-semibold text-[#003366]/70">ยอดรายการนี้</p>
                    <p className="mt-1 text-2xl font-bold text-[#003366]">
                      {formatTHB(
                        Math.max(0, Number(quantityInput || "0") * Number(priceInput || "0")),
                      )}{" "}
                      บาท
                    </p>
                  </div>
                </div>

                <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4">
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="w-full rounded-2xl bg-[#003366] py-4 text-lg font-bold text-white shadow-sm transition hover:bg-[#002244] active:scale-[0.98]"
                  >
                    เพิ่มสินค้าเข้ารายการ
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export function CreateOrderModal({ customers, products, today }: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ModalTab>("create");
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [orderDate, setOrderDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [yesterdaySnapshot, setYesterdaySnapshot] = useState<CustomerYesterdaySnapshot | null>(null);
  const customerCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRequestId = useRef(0);
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const filteredCustomers = customerSearch
    ? customers.filter((c) => {
        const n = customerSearch.toLowerCase();
        return c.name.toLowerCase().includes(n) || c.code.toLowerCase().includes(n);
      })
    : customers;

  function scheduleCustomerClose() {
    customerCloseTimer.current = setTimeout(() => setCustomerOpen(false), 150);
  }

  function cancelCustomerClose() {
    if (customerCloseTimer.current) clearTimeout(customerCloseTimer.current);
  }

  async function loadYesterdaySnapshot(nextCustomerId: string, nextOrderDate: string) {
    if (!nextCustomerId) {
      setYesterdaySnapshot(null);
      setHistoryLoading(false);
      return null;
    }

    const requestId = ++historyRequestId.current;
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const snapshot = await fetchCustomerYesterdayItemsAction(nextCustomerId, nextOrderDate);
      if (historyRequestId.current !== requestId) {
        return null;
      }
      setYesterdaySnapshot(snapshot);
      return snapshot;
    } catch {
      if (historyRequestId.current === requestId) {
        setHistoryError("ไม่สามารถโหลดประวัติร้านค้านี้ได้");
      }
      return null;
    } finally {
      if (historyRequestId.current === requestId) {
        setHistoryLoading(false);
      }
    }
  }

  function applyYesterdayItemsToCart(snapshot: CustomerYesterdaySnapshot | null) {
    if (!snapshot || snapshot.items.length === 0) {
      setHistoryNotice("ไม่พบรายการเมื่อวานให้สั่งซ้ำ");
      return;
    }

    setCart((prev) => {
      const nextCart = [...prev];

      for (const row of snapshot.items) {
        const product = productsById.get(row.productId);
        if (!product) {
          continue;
        }

        const resolvedUnitPrice =
          priceMap[row.saleUnitId ?? row.productId] ?? priceMap[row.productId] ?? row.unitPrice;

        const existingIndex = nextCart.findIndex(
          (item) => item.productId === row.productId && item.saleUnitId === row.saleUnitId,
        );

        if (existingIndex >= 0) {
          const existingItem = nextCart[existingIndex];
          nextCart[existingIndex] = {
            ...existingItem,
            quantity: existingItem.quantity + row.quantity,
            unitPrice: resolvedUnitPrice,
          };
          continue;
        }

        nextCart.push({
          productId: row.productId,
          productName: product.name,
          quantity: row.quantity,
          saleUnitBaseQty: row.saleUnitBaseQty,
          saleUnitId: row.saleUnitId,
          saleUnitLabel: row.saleUnitLabel,
          unitPrice: resolvedUnitPrice,
        });
      }

      return nextCart;
    });

    setActiveTab("create");
    setHistoryNotice(`นำเข้ารายการจากเมื่อวานแล้ว ${snapshot.items.length} รายการ`);
  }

  async function handleCustomerSelect(id: string) {
    setHistoryNotice(null);
    setCustomerId(id);
    setCustomerSearch(customers.find((c) => c.id === id)?.name ?? "");
    setCustomerOpen(false);
    setPricesLoading(true);
    setHistoryError(null);
    try {
      const [prices] = await Promise.all([
        fetchCustomerPricesAction(id),
        loadYesterdaySnapshot(id, orderDate),
      ]);
      setPriceMap(prices);
      setCart((prev) =>
        prev.map((item) => ({
          ...item,
          unitPrice:
            prices[item.saleUnitId ?? item.productId] ??
            prices[item.productId] ??
            item.unitPrice,
        })),
      );
    } catch {
      setHistoryError("โหลดข้อมูลร้านค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setPricesLoading(false);
    }
  }

  function addToCart(
    product: OrderProductOption,
    unitId: string | null,
    unitLabel: string,
    baseQty: number,
    quantity: number,
    unitPrice: number,
  ) {
    const existingIndex = cart.findIndex(
      (item) => item.productId === product.id && item.saleUnitId === unitId,
    );
    if (existingIndex >= 0) {
      setCart((prev) =>
        prev.map((item, i) =>
          i === existingIndex ? { ...item, quantity: item.quantity + quantity, unitPrice } : item,
        ),
      );
    } else {
      setCart((prev) => [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity,
          saleUnitBaseQty: baseQty,
          saleUnitId: unitId,
          saleUnitLabel: unitLabel,
          unitPrice,
        },
      ]);
    }
    setProductModalOpen(false);
  }

  function updateQty(index: number, delta: number) {
    setCart((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item,
      ),
    );
  }

  function updatePrice(index: number, value: string) {
    const price = parseFloat(value);
    if (!Number.isFinite(price) || price < 0) return;
    setCart((prev) =>
      prev.map((item, i) => (i === index ? { ...item, unitPrice: price } : item)),
    );
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function resetForm() {
    historyRequestId.current += 1;
    setActiveTab("create");
    setCart([]);
    setCustomerId("");
    setCustomerSearch("");
    setCustomerOpen(false);
    setOrderDate(today);
    setNotes("");
    setError(null);
    setSuccess(null);
    setHistoryNotice(null);
    setPriceMap({});
    setPricesLoading(false);
    setHistoryLoading(false);
    setHistoryError(null);
    setYesterdaySnapshot(null);
    setProductModalOpen(false);
  }

  function handleClose() {
    setOpen(false);
    resetForm();
  }

  function handleSubmit() {
    setError(null);
    if (!customerId) return setError("กรุณาเลือกลูกค้าก่อน");
    if (cart.length === 0) return setError("กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("customerId", customerId);
      formData.set("channel", "created");
      formData.set("orderDate", orderDate);
      formData.set("notes", notes);
      formData.set("items", JSON.stringify(cart));
      const result = await createManualOrderAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(result.orderNumber ?? "สำเร็จ");
      setTimeout(handleClose, 1800);
    });
  }

  const totalAmount = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const historyItems = yesterdaySnapshot?.items ?? [];

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-2xl bg-[#003366] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#002244] active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        สร้างออเดอร์
      </button>

      {/* Main modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4">
          <div className="absolute inset-0" onClick={handleClose} />

          <div className="relative flex max-h-[96dvh] w-full max-w-lg flex-col rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]">

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/10">
                  <ShoppingCart className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-950">สร้างออเดอร์ใหม่</h2>
                  <p className="text-xs text-slate-500">ช่องทาง: สร้าง (โดยแอดมิน)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 active:scale-95"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" strokeWidth={2.2} />
              </button>
            </div>

            {/* Success banner */}
            {success && (
              <div className="shrink-0 bg-emerald-50 px-5 py-3.5 text-base font-semibold text-emerald-700">
                สร้างออเดอร์ {success} สำเร็จแล้ว ✓
              </div>
            )}

            {/* Customer + date — outside overflow-y-auto so dropdown is never clipped */}
            <div className="relative shrink-0 border-b border-slate-100 px-4 pb-4 pt-4 sm:px-5" onMouseDown={cancelCustomerClose}>
              <div className="space-y-4">
                {/* Customer */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    ลูกค้า <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div
                      className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 transition focus-within:ring-2 focus-within:ring-[#003366]/10 ${
                        customerId
                          ? "border-[#003366]/40"
                          : "border-slate-200 focus-within:border-[#003366]/50"
                      }`}
                    >
                      <Building2 className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2} />
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setCustomerId("");
                          setPriceMap({});
                          setYesterdaySnapshot(null);
                          setHistoryError(null);
                          setHistoryNotice(null);
                          setCustomerOpen(true);
                        }}
                        onFocus={() => setCustomerOpen(true)}
                        onBlur={scheduleCustomerClose}
                        placeholder="ค้นหาชื่อร้าน หรือรหัสร้าน"
                        className="min-w-0 flex-1 bg-transparent text-base text-slate-800 outline-none placeholder:text-slate-400"
                      />
                      {customerId && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setCustomerId("");
                            setCustomerSearch("");
                            setPriceMap({});
                            setYesterdaySnapshot(null);
                            setHistoryError(null);
                            setHistoryNotice(null);
                            setCustomerOpen(true);
                          }}
                          className="text-slate-400 transition hover:text-slate-600"
                          aria-label="ล้างการเลือกลูกค้า"
                        >
                          <X className="h-4 w-4" strokeWidth={2} />
                        </button>
                      )}
                    </div>

                    {customerOpen && !customerId && filteredCustomers.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        {filteredCustomers.map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleCustomerSelect(customer.id)}
                            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 first:rounded-t-2xl last:rounded-b-2xl"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                              <Building2 className="h-4.5 w-4.5 text-slate-400" strokeWidth={1.9} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base font-semibold text-slate-900">
                                {customer.name}
                              </p>
                              <p className="text-sm text-slate-400">{customer.code}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Order date */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    วันที่ออเดอร์
                  </label>
                  <ThaiDatePicker
                    id="create-order-date"
                    name="orderDate"
                    value={orderDate}
                    onChange={(nextOrderDate) => {
                      setOrderDate(nextOrderDate);
                      setHistoryNotice(null);
                      if (!customerId) return;
                      void loadYesterdaySnapshot(customerId, nextOrderDate);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
              <div className="space-y-5">
                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("create")}
                      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                        activeTab === "create"
                          ? "bg-[#003366] text-white shadow-sm"
                          : "bg-white text-slate-600 hover:text-[#003366]"
                      }`}
                    >
                      <ClipboardList className="h-4 w-4" strokeWidth={2.2} />
                      สร้างออเดอร์
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("history")}
                      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                        activeTab === "history"
                          ? "bg-[#003366] text-white shadow-sm"
                          : "bg-white text-slate-600 hover:text-[#003366]"
                      }`}
                    >
                      <History className="h-4 w-4" strokeWidth={2.2} />
                      ประวัติร้านนี้
                    </button>
                  </div>
                  <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                    {!customerId
                      ? "เลือกลูกค้าก่อน เพื่อดูประวัติการสั่งซื้อและสั่งซ้ำ"
                      : `ดึงรายการจากวันที่ ${formatThaiShortDate(
                          yesterdaySnapshot?.sourceDate ?? "",
                        )} สำหรับร้านที่เลือก`}
                  </div>
                </section>

                {historyNotice ? (
                  <div className="rounded-2xl border border-[#003366]/20 bg-[#003366]/5 px-4 py-3 text-sm font-medium text-[#003366]">
                    {historyNotice}
                  </div>
                ) : null}

                {activeTab === "create" ? (
                  <>
                    {/* รายการสินค้า */}
                    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-bold tracking-widest text-slate-400 uppercase">
                          รายการสินค้า
                        </p>
                        <button
                          type="button"
                          onClick={() => setProductModalOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#003366] px-3 py-2 text-sm font-bold text-white transition hover:bg-[#002244] active:scale-95"
                        >
                          <Plus className="h-4 w-4" strokeWidth={2.5} />
                          เพิ่มสินค้า
                        </button>
                      </div>

                      <div className="px-4 py-4">
                        {cart.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => setProductModalOpen(true)}
                            className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center transition hover:border-[#003366]/30 hover:bg-[#003366]/5"
                          >
                            <Package2 className="h-9 w-9 text-slate-300" strokeWidth={1.8} />
                            <p className="mt-3 text-base font-semibold text-slate-500">
                              ยังไม่มีสินค้าในออเดอร์
                            </p>
                            <p className="mt-1 text-sm text-slate-400">แตะที่นี่เพื่อเพิ่มสินค้า</p>
                          </button>
                        ) : (
                          <div className="space-y-3">
                            {cart.map((item, index) => (
                              <div
                                key={`${item.productId}-${item.saleUnitId}`}
                                className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                              >
                                <div className="flex items-start justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-base font-semibold leading-snug text-slate-900">
                                      {item.productName}
                                    </p>
                                    <p className="mt-0.5 text-sm text-slate-400">
                                      {item.saleUnitLabel}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeFromCart(index)}
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-rose-400 transition hover:bg-rose-50 hover:text-rose-600 active:scale-95"
                                    aria-label="ลบรายการสินค้า"
                                  >
                                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                                  </button>
                                </div>

                                <div className="space-y-4 px-4 py-4">
                                  <div>
                                    <p className="mb-2 text-sm font-semibold text-slate-600">จำนวน</p>
                                    <div className="flex items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() => updateQty(index, -1)}
                                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
                                      >
                                        <Minus className="h-5 w-5" strokeWidth={2.5} />
                                      </button>
                                      <span className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 py-3 text-center text-2xl font-bold tabular-nums text-slate-900">
                                        {item.quantity}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => updateQty(index, 1)}
                                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
                                      >
                                        <Plus className="h-5 w-5" strokeWidth={2.5} />
                                      </button>
                                    </div>
                                  </div>

                                  <div>
                                    <p className="mb-2 text-sm font-semibold text-slate-600">
                                      ราคาต่อหน่วย (บาท)
                                    </p>
                                    <div className="relative">
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={item.unitPrice}
                                        onChange={(e) => updatePrice(index, e.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-14 text-right text-lg font-bold text-slate-900 outline-none transition focus:border-[#003366]/50 focus:ring-2 focus:ring-[#003366]/10"
                                      />
                                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                                        บาท
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                                    <span className="text-sm font-medium text-slate-500">
                                      ยอดรายการ
                                    </span>
                                    <span className="text-lg font-bold tabular-nums text-slate-900">
                                      {formatTHB(item.quantity * item.unitPrice)} บาท
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={() => setProductModalOpen(true)}
                              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-4 text-sm font-semibold text-slate-500 transition hover:border-[#003366]/30 hover:text-[#003366]"
                            >
                              <Plus className="h-4 w-4" strokeWidth={2.5} />
                              เพิ่มสินค้าอีกรายการ
                            </button>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* หมายเหตุ */}
                    <section>
                      <label className="mb-2 block text-base font-semibold text-slate-800">
                        หมายเหตุ
                        <span className="ml-2 text-sm font-normal text-slate-400">(ถ้ามี)</span>
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder="หมายเหตุเพิ่มเติม เช่น ข้อความพิเศษ หรือรายละเอียดการจัดส่ง"
                        className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base text-slate-700 outline-none transition focus:border-[#003366]/50 focus:ring-2 focus:ring-[#003366]/10 placeholder:text-slate-400"
                      />
                    </section>
                  </>
                ) : (
                  <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-700">รายการที่ร้านนี้เคยสั่งเมื่อวาน</p>
                      {customerId ? (
                        <button
                          type="button"
                          onClick={() => void loadYesterdaySnapshot(customerId, orderDate)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:text-[#003366]"
                        >
                          รีเฟรช
                        </button>
                      ) : null}
                    </div>

                    <div className="px-4 py-4">
                      {!customerId ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          กรุณาเลือกร้านค้าก่อน
                        </div>
                      ) : historyLoading ? (
                        <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                          กำลังโหลดประวัติการสั่งซื้อ
                        </div>
                      ) : historyError ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                          {historyError}
                        </div>
                      ) : historyItems.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          ไม่พบประวัติการสั่งซื้อของเมื่อวาน
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            วันที่อ้างอิง {formatThaiShortDate(yesterdaySnapshot?.sourceDate ?? "")}
                            <span className="mx-2 text-slate-300">|</span>
                            {yesterdaySnapshot?.orderCount ?? 0} ใบสั่งซื้อ
                          </div>

                          {historyItems.map((item) => {
                            const product = productsById.get(item.productId);
                            const name = product?.name ?? item.productId;
                            return (
                              <div
                                key={`${item.productId}-${item.saleUnitId ?? "__default__"}`}
                                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3"
                              >
                                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                                  {product?.imageUrl ? (
                                    <Image
                                      src={product.imageUrl}
                                      alt={name}
                                      fill
                                      className="object-cover"
                                      sizes="44px"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                      <Package2 className="h-5 w-5 text-slate-400" strokeWidth={1.9} />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    {item.quantity.toLocaleString("th-TH")} {item.saleUnitLabel} ·{" "}
                                    {formatTHB(item.unitPrice)} บาท
                                  </p>
                                </div>
                              </div>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => applyYesterdayItemsToCart(yesterdaySnapshot)}
                            className="mt-2 w-full rounded-2xl bg-[#003366] py-3 text-sm font-bold text-white transition hover:bg-[#002244] active:scale-[0.98]"
                          >
                            สั่งซ้ำและกลับไปแก้รายการ
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-safe-or-5 pt-4 sm:px-5">
              {error && (
                <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
                    !
                  </span>
                  <p className="text-base font-medium text-rose-700">{error}</p>
                </div>
              )}

              {activeTab === "create" ? (
                <>
                  <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <span className="text-base font-semibold text-slate-600">ยอดรวมทั้งหมด</span>
                    <span className="text-2xl font-bold tabular-nums text-slate-950">
                      {formatTHB(totalAmount)}{" "}
                      <span className="text-lg font-semibold">บาท</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={pending || !customerId || cart.length === 0}
                    className="w-full rounded-2xl bg-[#003366] py-5 text-lg font-bold text-white shadow-md transition hover:bg-[#002244] disabled:opacity-40 active:scale-[0.98]"
                  >
                    {pending ? "กำลังสร้างออเดอร์..." : "บันทึกออเดอร์"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <ProductSelectModal
        cart={cart}
        noCustomer={!customerId}
        onClose={() => setProductModalOpen(false)}
        onConfirm={addToCart}
        open={productModalOpen}
        priceMap={priceMap}
        products={products}
        productsLoading={pricesLoading}
      />
    </>
  );
}


