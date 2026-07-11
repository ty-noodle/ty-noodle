"use client";

import Image from "next/image";
import { Boxes, Package, PackageSearch, Store, Truck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { compareCustomerOrder } from "@/lib/settings/customer-order";

export type PackingListSummaryProduct = {
  key: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  imageUrl?: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
};

export type PackingListSummaryStore = {
  id: string;
  customerCode: string;
  customerName: string;
  sortOrder?: number;
  date: string;
  dateLabel: string;
  itemCount: number;
  totalQuantity: number;
  vehicleId: string | null;
  vehicleName: string | null;
  items: Array<{
    key: string;
    sku: string;
    name: string;
    unit: string;
    quantity: number;
  }>;
};

type VehicleProductGroup = {
  vehicleKey: string;
  vehicleName: string;
  products: PackingListSummaryProduct[];
};

type VehicleStoreGroup = {
  vehicleKey: string;
  vehicleName: string;
  stores: PackingListSummaryStore[];
};

function formatQty(quantity: number, unit: string) {
  return `${quantity.toLocaleString("th-TH")} ${unit}`;
}

function resolveVehicleName(vehicleName: string | null) {
  return vehicleName?.trim() || "ยังไม่กำหนดรถ";
}

function buildVehicleKey(vehicleId: string | null, vehicleName: string | null) {
  return `${vehicleId ?? "unassigned"}::${resolveVehicleName(vehicleName)}`;
}

function VehicleTabs({
  groups,
  activeKey,
  onSelect,
}: {
  groups: Array<{ vehicleKey: string; vehicleName: string }>;
  activeKey: string | null;
  onSelect: (vehicleKey: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 md:gap-2">
      {groups.map((group) => {
        const active = group.vehicleKey === activeKey;
        return (
          <button
            key={group.vehicleKey}
            type="button"
            onClick={() => onSelect(group.vehicleKey)}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold transition md:gap-2 md:px-3.5 md:py-2 md:text-sm ${
              active ? "bg-[#003366] text-white shadow-sm" : "bg-slate-100 text-slate-700"
            }`}
          >
            <Truck className="h-3.5 w-3.5 md:h-4 md:w-4" strokeWidth={2.2} />
            {group.vehicleName}
          </button>
        );
      })}
    </div>
  );
}

export function PackingListSummaryButton({
  dateLabel,
  products,
  stores,
}: {
  dateLabel: string;
  products: PackingListSummaryProduct[];
  stores: PackingListSummaryStore[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"products" | "stores">("products");
  const [activeProductVehicleKey, setActiveProductVehicleKey] = useState<string | null>(null);
  const [activeStoreVehicleKey, setActiveStoreVehicleKey] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(stores[0]?.id ?? null);
  const [mobileStoreId, setMobileStoreId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen && !mobileStoreId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, mobileStoreId]);

  const productGroups = useMemo<VehicleProductGroup[]>(() => {
    const map = new Map<string, VehicleProductGroup>();
    for (const product of products) {
      const vehicleKey = buildVehicleKey(product.vehicleId, product.vehicleName);
      const current = map.get(vehicleKey) ?? {
        vehicleKey,
        vehicleName: resolveVehicleName(product.vehicleName),
        products: [],
      };
      current.products.push(product);
      map.set(vehicleKey, current);
    }

    return Array.from(map.values()).map((group) => ({
      ...group,
      products: [...group.products].sort((a, b) => a.name.localeCompare(b.name, "th") || a.sku.localeCompare(b.sku, "th")),
    }));
  }, [products]);

  const storeGroups = useMemo<VehicleStoreGroup[]>(() => {
    const map = new Map<string, VehicleStoreGroup>();
    for (const store of stores) {
      const vehicleKey = buildVehicleKey(store.vehicleId, store.vehicleName);
      const current = map.get(vehicleKey) ?? {
        vehicleKey,
        vehicleName: resolveVehicleName(store.vehicleName),
        stores: [],
      };
      current.stores.push(store);
      map.set(vehicleKey, current);
    }

    return Array.from(map.values()).map((group) => ({
      ...group,
      stores: [...group.stores].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          compareCustomerOrder(a, b),
      ),
    }));
  }, [stores]);

  const resolvedProductVehicleKey =
    activeProductVehicleKey && productGroups.some((group) => group.vehicleKey === activeProductVehicleKey)
      ? activeProductVehicleKey
      : (productGroups[0]?.vehicleKey ?? null);

  const resolvedStoreVehicleKey =
    activeStoreVehicleKey && storeGroups.some((group) => group.vehicleKey === activeStoreVehicleKey)
      ? activeStoreVehicleKey
      : (storeGroups[0]?.vehicleKey ?? null);

  const activeProductGroup = useMemo(
    () => productGroups.find((group) => group.vehicleKey === resolvedProductVehicleKey) ?? productGroups[0] ?? null,
    [productGroups, resolvedProductVehicleKey],
  );

  const activeStoreGroup = useMemo(
    () => storeGroups.find((group) => group.vehicleKey === resolvedStoreVehicleKey) ?? storeGroups[0] ?? null,
    [resolvedStoreVehicleKey, storeGroups],
  );

  const selectedStore = useMemo(() => {
    return activeStoreGroup?.stores.find((store) => store.id === selectedStoreId) ?? activeStoreGroup?.stores[0] ?? null;
  }, [activeStoreGroup, selectedStoreId]);

  const mobileStore = useMemo(() => {
    return activeStoreGroup?.stores.find((store) => store.id === mobileStoreId) ?? null;
  }, [activeStoreGroup, mobileStoreId]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-[#003366]/15 bg-[#eff6ff] px-3.5 py-1.5 text-[13px] font-bold text-[#003366] shadow-sm transition hover:bg-[#dbeafe] active:scale-[0.98]"
      >
        <PackageSearch className="h-4 w-4" strokeWidth={2.4} />
        สรุปสินค้า
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[140]">
          <button
            type="button"
            aria-label="ปิดสรุปสินค้า"
            className="absolute inset-0 bg-slate-950/55"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute inset-0 overflow-hidden bg-white shadow-[0_20px_60px_rgba(15,23,42,0.25)] md:inset-x-[10%] md:bottom-[8%] md:top-[8%] md:rounded-[28px]">
            <div className="flex h-full flex-col">
              <div className="border-b border-slate-200 px-5 pb-4 pt-4">
                <div className="mb-3 flex justify-center md:hidden">
                  <div className="h-1.5 w-14 rounded-full bg-slate-200" />
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[1.2rem] font-bold leading-tight text-slate-950">สรุปสินค้าตามวันที่เลือก</p>
                    <p className="mt-1 text-sm font-medium text-slate-500">{dateLabel}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
                    aria-label="ปิด"
                  >
                    <X className="h-5 w-5" strokeWidth={2.4} />
                  </button>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("products")}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
                      activeTab === "products" ? "bg-[#003366] text-white shadow-sm" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    <Boxes className="h-4 w-4" strokeWidth={2.2} />
                    รวมทุกสินค้า
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("stores")}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
                      activeTab === "stores" ? "bg-[#003366] text-white shadow-sm" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    <Store className="h-4 w-4" strokeWidth={2.2} />
                    ตามร้านค้า
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                {activeTab === "products" ? (
                  <div className="h-full overflow-y-auto px-0 py-4 md:px-5">
                    <div className="space-y-4">
                      <VehicleTabs
                        groups={productGroups}
                        activeKey={activeProductGroup?.vehicleKey ?? null}
                        onSelect={setActiveProductVehicleKey}
                      />

                      {activeProductGroup ? (
                        <section className="px-4 md:rounded-2xl md:border md:border-slate-200 md:bg-slate-50/70 md:p-4">
                          <div className="mb-2 flex items-center gap-2 px-1 py-1 md:mb-3 md:rounded-xl md:bg-white md:px-3 md:py-2 md:shadow-sm">
                            <span className="inline-flex size-9 items-center justify-center rounded-full bg-[#eff6ff] text-[#003366]">
                              <Truck className="h-4.5 w-4.5" strokeWidth={2.2} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-950">{activeProductGroup.vehicleName}</p>
                              <p className="text-xs font-medium text-slate-500">
                                {activeProductGroup.products.length.toLocaleString("th-TH")} สินค้า
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 border-l border-t border-slate-200 md:grid-cols-3 md:gap-3 md:border-0 xl:grid-cols-4">
                            {activeProductGroup.products.map((product) => (
                              <article
                                key={product.key}
                                className="border-b border-r border-slate-200 px-2 py-2 md:rounded-2xl md:border md:bg-white md:px-3 md:py-3 md:shadow-sm"
                              >
                                <div className="flex flex-col items-center text-center">
                                  <div className="relative mb-1 h-18 w-full overflow-hidden rounded-xl md:mb-2 md:h-20">
                                    {product.imageUrl ? (
                                      <Image
                                        src={product.imageUrl}
                                        alt={product.name}
                                        fill
                                        unoptimized
                                        sizes="(max-width: 768px) 40vw, 180px"
                                        className="object-contain p-1"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center">
                                        <Package className="h-8 w-8 text-slate-300" strokeWidth={1.8} />
                                      </div>
                                    )}
                                  </div>

                                  <p className="line-clamp-2 min-h-[2.35rem] text-[13px] font-bold leading-[1.15] text-slate-950 md:min-h-[2.75rem] md:leading-snug md:text-[14px]">
                                    {product.name}
                                  </p>

                                  <p className="mt-0.5 px-1 text-[26px] font-extrabold leading-none text-slate-950 md:mt-2 md:text-[20px]">
                                    {formatQty(product.quantity, product.unit)}
                                  </p>
                                </div>
                              </article>
                            ))}
                          </div>
                        </section>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="h-full overflow-y-auto px-0 py-4 md:hidden">
                      <div className="space-y-4">
                        <VehicleTabs
                          groups={storeGroups}
                          activeKey={activeStoreGroup?.vehicleKey ?? null}
                          onSelect={(vehicleKey) => {
                            const group = storeGroups.find((entry) => entry.vehicleKey === vehicleKey);
                            setActiveStoreVehicleKey(vehicleKey);
                            setSelectedStoreId(group?.stores[0]?.id ?? null);
                            setMobileStoreId(null);
                          }}
                        />

                        {activeStoreGroup ? (
                          <section className="space-y-2 px-4">
                            <div className="flex items-center gap-2 px-1 py-1">
                              <span className="inline-flex size-8 items-center justify-center rounded-full bg-white text-[#003366] shadow-sm">
                                <Truck className="h-4 w-4" strokeWidth={2.2} />
                              </span>
                              <p className="text-sm font-bold text-slate-950">{activeStoreGroup.vehicleName}</p>
                            </div>

                            <div className="space-y-2">
                              {activeStoreGroup.stores.map((store) => (
                                <button
                                  key={store.id}
                                  type="button"
                                  onClick={() => setMobileStoreId(store.id)}
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-slate-50 active:scale-[0.99]"
                                >
                                  <p className="text-[15px] font-bold leading-tight text-slate-950">
                                    <span translate="no">{store.customerCode}</span> - {store.customerName}
                                  </p>
                                  <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
                                    <span>{store.itemCount.toLocaleString("th-TH")} รายการ</span>
                                    <span>{store.totalQuantity.toLocaleString("th-TH")} หน่วย</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </section>
                        ) : null}
                      </div>
                    </div>

                    <div className="hidden h-full min-h-0 md:grid md:grid-cols-[320px_minmax(0,1fr)]">
                      <div className="overflow-y-auto border-r border-slate-200">
                        <div className="space-y-4 px-4 py-4">
                          <VehicleTabs
                            groups={storeGroups}
                            activeKey={activeStoreGroup?.vehicleKey ?? null}
                            onSelect={(vehicleKey) => {
                              const group = storeGroups.find((entry) => entry.vehicleKey === vehicleKey);
                              setActiveStoreVehicleKey(vehicleKey);
                              setSelectedStoreId(group?.stores[0]?.id ?? null);
                              setMobileStoreId(null);
                            }}
                          />

                          {activeStoreGroup ? (
                            <section className="space-y-2">
                              <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2">
                                <span className="inline-flex size-8 items-center justify-center rounded-full bg-white text-[#003366] shadow-sm">
                                  <Truck className="h-4 w-4" strokeWidth={2.2} />
                                </span>
                                <p className="text-sm font-bold text-slate-950">{activeStoreGroup.vehicleName}</p>
                              </div>

                              <div className="space-y-2">
                                {activeStoreGroup.stores.map((store) => {
                                  const active = selectedStore?.id === store.id;

                                  return (
                                    <button
                                      key={store.id}
                                      type="button"
                                      onClick={() => setSelectedStoreId(store.id)}
                                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                                        active
                                          ? "border-[#003366] bg-[#eff6ff] shadow-sm"
                                          : "border-slate-200 bg-white hover:bg-slate-50"
                                      }`}
                                    >
                                      <p className="text-[15px] font-bold leading-tight text-slate-950">
                                        <span translate="no">{store.customerCode}</span> - {store.customerName}
                                      </p>
                                      <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
                                        <span>{store.itemCount.toLocaleString("th-TH")} รายการ</span>
                                        <span>{store.totalQuantity.toLocaleString("th-TH")} หน่วย</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </section>
                          ) : null}
                        </div>
                      </div>

                      <div className="overflow-y-auto px-5 py-4">
                        {selectedStore ? (
                          <>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="text-[1rem] font-bold text-slate-950">
                                <span translate="no">{selectedStore.customerCode}</span> - {selectedStore.customerName}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-slate-500">
                                <span>{selectedStore.dateLabel}</span>
                                <span>รถ: {resolveVehicleName(selectedStore.vehicleName)}</span>
                              </div>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                              <table className="w-full border-collapse">
                                <thead className="bg-slate-50">
                                  <tr>
                                    <th className="px-4 py-3 text-left text-[12px] font-bold text-slate-700">ชื่อสินค้า</th>
                                    <th className="px-4 py-3 text-right text-[12px] font-bold text-slate-700">จำนวน</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedStore.items.map((item) => (
                                    <tr key={item.key} className="border-t border-slate-200">
                                      <td className="px-4 py-3 text-[14px] font-semibold text-slate-950">{item.name}</td>
                                      <td className="px-4 py-3 text-right text-[14px] font-bold text-[#003366]">
                                        {formatQty(item.quantity, item.unit)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm font-medium text-slate-400">
                            ยังไม่มีร้านค้าในช่วงวันที่เลือก
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {mobileStore ? (
            <div className="absolute inset-0 z-[150] md:hidden">
              <button
                type="button"
                aria-label="ปิดรายละเอียดร้านค้า"
                className="absolute inset-0 bg-slate-950/55"
                onClick={() => setMobileStoreId(null)}
              />

              <div className="absolute inset-0 overflow-hidden bg-white shadow-[0_20px_60px_rgba(15,23,42,0.25)] md:inset-x-3 md:bottom-3 md:top-16 md:rounded-[24px]">
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 pb-3 pt-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[1rem] font-bold leading-tight text-slate-950">
                        <span translate="no">{mobileStore.customerCode}</span> - {mobileStore.customerName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-slate-500">
                        <span>{mobileStore.dateLabel}</span>
                        <span>รถ: {resolveVehicleName(mobileStore.vehicleName)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMobileStoreId(null)}
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
                      aria-label="ปิด"
                    >
                      <X className="h-4.5 w-4.5" strokeWidth={2.4} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-0 py-4">
                    <div className="overflow-hidden bg-white md:mx-4 md:rounded-2xl md:border md:border-slate-200 md:shadow-sm">
                      <table className="w-full border-collapse">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-[12px] font-bold text-slate-700">ชื่อสินค้า</th>
                            <th className="px-4 py-3 text-right text-[12px] font-bold text-slate-700">จำนวน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mobileStore.items.map((item) => (
                            <tr key={item.key} className="border-t border-slate-200">
                              <td className="px-4 py-3 text-[14px] font-semibold leading-snug text-slate-950">{item.name}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-right text-[14px] font-bold text-[#003366]">
                                {formatQty(item.quantity, item.unit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
