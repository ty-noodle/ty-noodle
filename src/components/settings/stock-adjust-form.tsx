"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Loader2,
  Package2,
  Plus,
  Minus,
  Save,
  Search,
  X,
} from "lucide-react";
import {
  useActionState,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  startTransition,
} from "react";
import { adjustStockAction } from "@/app/(workspace)/settings/stock/actions";
import type { AdjustStockActionState } from "@/app/(workspace)/settings/stock/actions";
import type { StockProductOption } from "@/lib/stock/admin";

type StockAdjustFormProps = {
  products: StockProductOption[];
  returnHref: string;
  defaultProductId?: string;
  onClose?: () => void;
};

const initialAdjustStockState: AdjustStockActionState = {
  message: "",
  status: "idle",
};

export function StockAdjustForm({
  products,
  returnHref,
  defaultProductId = "",
  onClose,
}: StockAdjustFormProps) {
  const router = useRouter();
  const [actionState, formAction, isPending] = useActionState(
    adjustStockAction,
    initialAdjustStockState,
  );

  const [selectedProductId, setSelectedProductId] = useState(defaultProductId);
  const [newQuantity, setNewQuantity] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredQuery = useDeferredValue(searchQuery);

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId);
  }, [products, selectedProductId]);

  const filteredProducts = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 40);
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 40);
  }, [deferredQuery, products]);

  const handleSuccess = useEffectEvent(() => {
    startTransition(() => {
      if (onClose) {
        onClose();
      } else {
        router.replace(returnHref);
      }
      router.refresh();
    });
  });

  useEffect(() => {
    if (actionState.status === "success") {
      handleSuccess();
    }
  }, [actionState.status]);

  const [isClosing, setIsClosing] = useState(false);

  // Set initial quantity when product is selected
  useEffect(() => {
    if (selectedProduct) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial sync when product is selected
      setNewQuantity(String(selectedProduct.onHandQuantity));
    }
  }, [selectedProduct]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      if (onClose) {
        onClose();
      } else {
        router.replace(returnHref);
      }
    }, 400);
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-0 sm:p-4 ${
      isClosing ? "animate-fade-out" : "animate-fade-in"
    }`}>
      <div 
        onClick={handleClose}
        className="absolute inset-0" 
      />
      <div className={`relative flex h-full w-full max-w-lg flex-col overflow-hidden bg-[#F8FAFC] shadow-2xl rounded-none sm:rounded-[2.8rem] border border-white/40 ${
        isClosing ? "animate-slide-up-premium" : "animate-slide-down-premium"
      }`}>
        
        {/* Header */}
        <div className="shrink-0 bg-white/80 backdrop-blur-md px-6 py-5 border-b border-slate-200/60 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleClose}
              className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-all"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-xl font-black text-[#003366]">ปรับปรุงยอดสต็อก</h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
          {!selectedProductId ? (
            <div className="p-6">
              <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อสินค้า หรือ SKU..."
                  className="w-full h-14 pl-12 pr-4 bg-white border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-600/20 transition-all text-lg font-bold"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="divide-y divide-slate-100 -mx-6">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProductId(p.id)}
                    className="flex w-full items-center gap-4 px-6 py-4 bg-white hover:bg-slate-50 transition-all text-left"
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                      {p.imageUrl ? (
                        <Image src={p.imageUrl} alt={p.name} fill className="object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-50 border border-slate-100 rounded-xl">
                          <Package2 className="h-6 w-6 text-slate-200" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">{p.sku}</p>
                      <p className="text-base font-black text-slate-950 truncate leading-tight">{p.name}</p>
                      <p className="mt-1 text-sm font-bold text-indigo-600">คงเหลือ: {p.onHandQuantity} {p.unit}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              {/* Product Header Card */}
              <div className="p-6 bg-white border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-50 border border-slate-100">
                    {selectedProduct?.imageUrl ? (
                      <Image src={selectedProduct.imageUrl} alt={selectedProduct.name} fill className="object-contain" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package2 className="h-8 w-8 text-slate-200" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <button 
                      onClick={() => setSelectedProductId("")}
                      className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1 mb-1"
                    >
                      <ChevronLeft className="h-3 w-3" /> เปลี่ยนสินค้า
                    </button>
                    <h3 className="text-xl font-black text-slate-900 leading-tight">{selectedProduct?.name}</h3>
                    <p className="text-sm font-bold text-slate-400 mt-1">SKU: {selectedProduct?.sku}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-8">
                {/* Quantity Input Section */}
                <div className="space-y-4 text-center">
                  <label className="text-sm font-black text-slate-400 uppercase tracking-widest">จำนวนสต็อกที่ถูกต้อง ( {selectedProduct?.unit} )</label>
                  <div className="flex items-center justify-center gap-6">
                    <button
                      type="button"
                      onClick={() => setNewQuantity(String(Math.max(0, Number(newQuantity) - 1)))}
                      className="h-16 w-16 flex items-center justify-center rounded-3xl bg-white border-2 border-slate-100 text-slate-400 active:scale-90 transition-all shadow-sm"
                    >
                      <Minus className="h-8 w-8" strokeWidth={3} />
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={newQuantity}
                      onChange={(e) => setNewQuantity(e.target.value)}
                      className="w-32 text-5xl font-black text-slate-950 text-center outline-none bg-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setNewQuantity(String(Number(newQuantity) + 1))}
                      className="h-16 w-16 flex items-center justify-center rounded-3xl bg-indigo-600 text-white active:scale-90 transition-all shadow-lg shadow-indigo-600/20"
                    >
                      <Plus className="h-8 w-8" strokeWidth={3} />
                    </button>
                  </div>
                </div>

                {/* Info Card */}
                <div className="bg-indigo-50/50 rounded-[2rem] p-6 border border-indigo-100/50 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-indigo-600/60">คงเหลือเดิม</span>
                    <span className="text-lg font-black text-indigo-900">{selectedProduct?.onHandQuantity} {selectedProduct?.unit}</span>
                  </div>
                  <div className="h-px bg-indigo-100/50" />
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-indigo-600/60">ยอดปรับปรุง</span>
                    <span className="text-lg font-black text-indigo-900">
                      {Number(newQuantity) - (selectedProduct?.onHandQuantity || 0) > 0 ? "+" : ""}
                      {Number(newQuantity) - (selectedProduct?.onHandQuantity || 0)} {selectedProduct?.unit}
                    </span>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-3">
                  <label className="text-sm font-black text-slate-400 uppercase tracking-widest pl-2">หมายเหตุการปรับปรุง</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="ระบุสาเหตุการปรับยอด (ถ้ามี)..."
                    className="w-full h-32 p-5 rounded-3xl bg-white border-2 border-slate-100 outline-none focus:border-indigo-600/20 transition-all text-lg font-medium resize-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Action */}
        {selectedProductId && (
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-xl border-t border-slate-100">
            <button
              onClick={() => {
                const formData = new FormData();
                formData.append("productId", selectedProductId);
                formData.append("newQuantity", newQuantity);
                formData.append("notes", notes);
                startTransition(() => {
                  formAction(formData);
                });
              }}
              disabled={isPending}
              className="w-full h-16 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xl flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {isPending ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <Save className="h-6 w-6" />
                  บันทึกรายการ
                </>
              )}
            </button>
            {actionState.message && (
              <p className="mt-3 text-center text-sm font-bold text-rose-500">
                {actionState.message}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
