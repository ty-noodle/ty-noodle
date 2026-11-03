"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { AlertTriangle, CheckCircle2, Loader2, Minus, Package2, Plus, X, PackagePlus } from "lucide-react";
import type { OrderStoreDetail } from "@/lib/orders/admin";
import { getShortagesForDate } from "@/app/(workspace)/orders/actions";
import { bulkReceiveStockAction, type BulkReceiveItem } from "@/app/(workspace)/settings/stock/actions";

type ShortageReceiveModalProps = {
  orderDate: string;
  active: boolean; // Only show trigger button if there is shortage
};

export function ShortageReceiveModal({ orderDate, active }: ShortageReceiveModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const onClose = () => {
    setIsOpen(false);
    setStores([]);
    setQuantities({});
    setSuccessMsg("");
  };
  const [isPending, startTransition] = useTransition();
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [stores, setStores] = useState<OrderStoreDetail[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      getShortagesForDate(orderDate)
        .then((data) => {
          setStores(data);
          // Auto-fill initial short quantities
          const initialQty: Record<string, number> = {};
          data.forEach(store => {
            store.items.forEach(item => {
              if (item.shortBaseQuantity > 0) {
                const key = `${store.customerId}::${item.productId}::${item.productBaseUnit}::1`;
                initialQty[key] = item.shortBaseQuantity;
              }
            });
          });
          setQuantities(initialQty);
        })
        .finally(() => setIsLoadingData(false));
    }
  }, [isOpen, orderDate]);

  function adjustQty(key: string, delta: number) {
    setQuantities(prev => ({
      ...prev,
      [key]: Math.max(0, (prev[key] || 0) + delta)
    }));
  }

  function handleSave() {
    if (isPending) return;

    startTransition(async () => {
      setSuccessMsg("");
      
      const itemsToReceive: BulkReceiveItem[] = [];
      const itemKeys = Object.keys(quantities);
      
      itemKeys.forEach(key => {
        const qty = quantities[key];
        if (qty > 0) {
          const [, productId, unit, ratioStr] = key.split("::");
          const unitRatio = parseFloat(ratioStr) || 1;
          
          // Combine duplicates if same product from different stores
          const existing = itemsToReceive.find(i => i.productId === productId && i.unit === unit);
          if (existing) {
            existing.quantityReceived += qty;
          } else {
            itemsToReceive.push({
              productId,
              quantityReceived: qty,
              unit,
              unitRatio
            });
          }
        }
      });

      if (itemsToReceive.length === 0) {
        onClose();
        return;
      }

      const res = await bulkReceiveStockAction(itemsToReceive, "รับเข้าแบบด่วนจากหน้ารายวัน");
      if (res?.success) {
        setSuccessMsg(res.message);
        setTimeout(() => onClose(), 1500);
      } else {
        alert(res?.message ?? "เกิดข้อผิดพลาด");
      }
    });
  }

  if (!active) return null;

  const totalToReceive = Object.values(quantities).reduce((a, b) => a + b, 0);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSuccessMsg("");
          setIsLoadingData(true);
          setIsOpen(true);
        }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/25 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_2px_10px_rgba(0,0,0,0.1)] backdrop-blur-md transition hover:bg-white/35 active:scale-95 border border-white/20"
      >
        <PackagePlus className="h-4 w-4" strokeWidth={2.5} />
        รับเข้าสต็อค
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col pt-[env(safe-area-inset-top)]">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
            onClick={onClose}
          />
      
      <div className="relative mt-auto flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl transition-transform md:m-auto md:max-h-[85vh] md:w-full md:max-w-2xl md:rounded-[2rem]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">รับเข้าสต็อกด่วน</h2>
              <p className="text-sm font-medium text-slate-500">สำหรับสินค้าที่สต็อกไม่พอ</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 p-4 md:p-6">
          {isLoadingData ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#003366]" />
              <p className="text-sm font-medium text-slate-500">กำลังโหลดรายการ...</p>
            </div>
          ) : stores.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3 text-emerald-600">
               <CheckCircle2 className="h-10 w-10" strokeWidth={2} />
               <p className="font-semibold">ไม่มีสินค้าขาดสต็อกแล้ว</p>
            </div>
          ) : (
            <div className="space-y-6">
              {stores.map((store) => {
                const shortItemMap = new Map<string, (typeof store.items)[number]>();
                for (const item of store.items) {
                  if (item.shortBaseQuantity <= 0) continue;

                  const existing = shortItemMap.get(item.productId);
                  shortItemMap.set(
                    item.productId,
                    existing
                      ? {
                          ...existing,
                          orderedBaseQuantity:
                            existing.orderedBaseQuantity + item.orderedBaseQuantity,
                        }
                      : item,
                  );
                }
                const shortItems = Array.from(shortItemMap.values());
                if (shortItems.length === 0) return null;

                return (
                  <div key={store.customerId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    {/* Store Header */}
                    <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                      <div className="flex items-center gap-2">
                         <span className="font-mono text-xs font-bold text-[#003366]/70 bg-[#003366]/5 border border-[#003366]/10 px-1.5 py-0.5 rounded-md">
                           {store.customerCode}
                         </span>
                         <span className="text-[15px] font-bold text-slate-900">{store.customerName}</span>
                      </div>
                    </div>
                    
                    {/* Short Items List */}
                    <div className="divide-y divide-slate-100">
                      {shortItems.map((item, idx) => {
                        const key = `${store.customerId}::${item.productId}::${item.productBaseUnit}::1`;
                        const qty = quantities[key] || 0;
                        
                        return (
                          <div key={`${key}-${idx}`} className="p-4 md:flex md:items-center md:gap-4 md:justify-between">
                            <div className="flex items-center gap-3 md:flex-1">
                              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                                {item.imageUrl ? (
                                  <Image src={item.imageUrl} alt={item.productName} fill sizes="48px" className="object-contain p-0.5" />
                                ) : (
                                  <Package2 className="h-5 w-5 text-slate-300" strokeWidth={1.8} />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-mono text-[11px] font-bold tracking-wider text-slate-400">{item.productSku}</p>
                                <p className="text-[15px] font-bold text-slate-900 leading-snug">{item.productName}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold">
                                  <span className="text-red-600">
                                    {"\u0e02\u0e32\u0e14"} : {item.shortBaseQuantity}{" "}
                                    {item.productBaseUnit}
                                  </span>
                                  <span className="text-slate-500">
                                    {"\u0e2d\u0e2d\u0e40\u0e14\u0e2d\u0e23\u0e4c\u0e23\u0e27\u0e21"} :{" "}
                                    {item.orderedBaseQuantity} {item.productBaseUnit}
                                  </span>
                                  <span className="text-slate-400">
                                    {"\u0e2a\u0e15\u0e47\u0e2d\u0e01"} :{" "}
                                    {item.currentStockBaseQuantity} {item.productBaseUnit}
                                  </span>
                                </div>
                            </div>
                            </div>

                            {/* Counter Input */}
                            <div className="mt-4 flex items-center justify-between gap-3 md:mt-0 md:justify-end">
                              <span className="text-xs font-bold text-[#003366] md:hidden">รับเข้า (หน่วย)</span>
                              <div className="flex h-11 w-32 shrink-0 items-center justify-between rounded-xl border border-[#003366]/20 bg-[#003366]/5 p-1 shadow-sm">
                                <button
                                  type="button"
                                  onClick={() => adjustQty(key, -1)}
                                  className="flex h-full w-9 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 active:scale-95 disabled:opacity-50"
                                  disabled={qty <= 0 || isPending}
                                >
                                  <Minus className="h-4 w-4" strokeWidth={2.5} />
                                </button>
                                <span className="flex-1 text-center font-mono text-base font-bold text-[#003366]">
                                  {qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => adjustQty(key, 1)}
                                  className="flex h-full w-9 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 active:scale-95 disabled:opacity-50"
                                  disabled={isPending}
                                >
                                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 border-t border-slate-100 bg-white p-4 md:px-6 md:py-5">
          {successMsg ? (
             <div className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-4 text-white shadow-md">
                <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
                <span className="font-bold">{successMsg}</span>
             </div>
          ) : (
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="hidden md:block">
                <p className="text-sm font-semibold text-slate-500">จำนวนที่เลือกรวม</p>
                <p className="text-xl font-bold text-[#003366]">{totalToReceive.toLocaleString()} หน่วย</p>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending || isLoadingData || stores.length === 0 || totalToReceive === 0}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#003366] px-4 py-4 text-[15px] font-bold tracking-wide text-white shadow-lg transition hover:bg-[#002244] active:scale-95 disabled:opacity-50 disabled:shadow-none md:w-auto md:min-w-[200px]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
                    <span>บันทึกเพิ่มสต็อก ({totalToReceive.toLocaleString()})</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
      )}
    </>
  );
}
