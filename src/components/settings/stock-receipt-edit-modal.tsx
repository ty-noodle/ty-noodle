"use client";

import { useActionState, useEffect, useState } from "react";
import { X, Calendar, Building2, Package, Save, Loader2, ChevronRight, Factory, Check } from "lucide-react";
import { updateStockReceiptAction, type UpdateStockReceiptActionState } from "@/app/(workspace)/settings/stock/actions";
import type { StockReceiptDetail, StockSupplierOption } from "@/lib/stock/admin";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

type EditableItem = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantityReceived: number;
  unit: string;
  unitCost: number;
  lineTotal: number;
};

type Props = {
  receipt: StockReceiptDetail;
  suppliers: StockSupplierOption[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function StockReceiptEditModal({ receipt, suppliers, isOpen, onClose, onSuccess }: Props) {
  const [state, formAction, isPending] = useActionState<UpdateStockReceiptActionState, FormData>(
    updateStockReceiptAction,
    { status: "idle", message: "", fieldErrors: {} }
  );

  const [editableItems, setEditableItems] = useState<EditableItem[]>(() =>
    receipt.items.map(item => ({ ...item, id: crypto.randomUUID() }))
  );

  const [isSupplierDrawerOpen, setIsSupplierDrawerOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(receipt.supplierId || "");
  const [supplierName, setSupplierName] = useState(receipt.supplierName || "");

  useEffect(() => {
    if (state.status === "success") {
      onSuccess();
      onClose();
    }
  }, [state.status, onSuccess, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("supplierId", supplierId);
    formData.set("supplierName", supplierName);
    
    editableItems.forEach((item, index) => {
      formData.append(`items[${index}].productId`, item.productId);
      formData.append(`items[${index}].quantityReceived`, item.quantityReceived.toString());
      formData.append(`items[${index}].unit`, item.unit);
      formData.append(`items[${index}].unitCost`, item.unitCost.toString());
    });
    formAction(formData);
  };

  const updateQuantity = (itemId: string, value: string) => {
    setEditableItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const qty = parseFloat(value) || 0;
        return { ...item, quantityReceived: qty, lineTotal: qty * item.unitCost };
      }
      return item;
    }));
  };

  const calculateTotal = () => editableItems.reduce((sum, item) => sum + item.lineTotal, 0);

  const formatDateForInput = (dateString: string) => {
    if (!dateString) return "";
    try { return new Date(dateString).toLocaleDateString("sv-SE"); }
    catch { return ""; }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col justify-end md:justify-center md:items-center md:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Sheet / Modal */}
      <div className="relative w-full md:max-w-lg bg-white md:rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92dvh] md:max-h-[88vh] animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-0 md:zoom-in-95 duration-300">

        {/* Drag handle (mobile only) */}
        <div className="md:hidden pt-3 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">แก้ไขใบรับสินค้า</p>
            <h2 className="text-[15px] font-black text-slate-900 mt-1 font-mono">{receipt.receiptNumber}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-90 shrink-0"
          >
            <X className="w-4 h-4 text-slate-600" strokeWidth={2.5} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <input type="hidden" name="receiptId" value={receipt.id} />
          <input type="hidden" name="originalReceivedAt" value={receipt.receivedAt} />

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain">

            {/* Section: Date & Supplier */}
            <div className="px-5 pt-5 pb-4 space-y-4 border-b border-slate-100">
              {/* Date */}
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  <Calendar className="w-3 h-3" />
                  วันที่รับสินค้า
                </label>
                <ThaiDatePicker
                  id="receivedAt"
                  name="receivedAt"
                  defaultValue={formatDateForInput(receipt.receivedAt)}
                />
                {state.fieldErrors?.receivedAt && (
                  <p className="mt-1 text-[12px] text-rose-600 font-medium">{state.fieldErrors.receivedAt}</p>
                )}
              </div>

              {/* Supplier Drawer Trigger */}
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  <Building2 className="w-3 h-3" />
                  ผู้จัดจำหน่าย
                </label>
                <button
                  type="button"
                  onClick={() => setIsSupplierDrawerOpen(true)}
                  className={`group relative w-full h-14 px-4 flex items-center justify-between bg-slate-50 border transition-all rounded-xl hover:bg-white hover:border-[#003366]/20 active:scale-[0.98] ${
                    supplierId ? "border-slate-200" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all ${
                      supplierId ? "bg-indigo-50 text-[#003366]" : "bg-slate-100 text-slate-400"
                    }`}>
                      <Factory size={18} />
                    </div>
                    <span className={`text-[15px] font-bold ${supplierId ? "text-slate-900" : "text-slate-400"}`}>
                      {supplierName || "เลือกผู้ขาย..."}
                    </span>
                  </div>
                  <ChevronRight className={`h-5 w-5 transition-transform group-hover:translate-x-1 ${supplierId ? "text-[#003366]" : "text-slate-300"}`} strokeWidth={3} />
                </button>
                {state.fieldErrors?.supplierId && (
                  <p className="mt-1 text-[12px] text-rose-600 font-medium">{state.fieldErrors.supplierId}</p>
                )}
              </div>
            </div>

            {/* Section: Items */}
            <div className="px-5 pt-4 pb-6 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <Package className="w-3 h-3" />
                  รายการสินค้า
                </label>
                <span className="text-[12px] font-black text-[#0051d5]">
                  รวม {calculateTotal().toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
                </span>
              </div>

              {editableItems.map((item) => (
                <div key={item.id} className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden p-4 space-y-4">
                  {/* Item Header: Name, Unit, and Total */}
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <h4 className="font-black text-slate-900 text-[16px] leading-snug break-words">
                        {item.productName}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">{item.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[18px] font-black text-[#0051d5]">
                        {item.lineTotal.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ฿
                      </p>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                        {item.unitCost.toLocaleString()} / {item.unit}
                      </p>
                    </div>
                  </div>

                  {/* Quantity Stepper Row */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                      แก้ไขจำนวน
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, (item.quantityReceived - 1).toString())}
                        className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 active:scale-90 transition-all hover:bg-slate-200"
                      >
                        <span className="text-2xl font-bold">−</span>
                      </button>
                      
                      <div className="flex-1 relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.quantityReceived}
                          onChange={(e) => updateQuantity(item.id, e.target.value)}
                          className="w-full h-12 rounded-xl bg-slate-50 border border-slate-100 text-center font-black text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0051d5]/20 focus:border-[#0051d5] transition-all"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, (item.quantityReceived + 1).toString())}
                        className="w-12 h-12 rounded-xl bg-[#0051d5]/10 flex items-center justify-center text-[#0051d5] active:scale-90 transition-all hover:bg-[#0051d5]/20"
                      >
                        <span className="text-2xl font-bold">+</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {state.status === "error" && state.message && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
                  <p className="text-[13px] text-rose-700 font-medium">{state.message}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-100 bg-white shrink-0 flex gap-3" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 h-13 rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 font-bold text-[15px] transition-all hover:bg-slate-100 disabled:opacity-50 active:scale-95"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-[2] h-13 rounded-2xl bg-[#0051d5] hover:bg-[#003da3] text-white font-bold text-[15px] transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  บันทึกการแก้ไข
                </>
              )}
            </button>
          </div>
        </form>

        {/* Supplier Selection Drawer (Overlay) */}
        {isSupplierDrawerOpen && (
          <div className="absolute inset-0 z-50 flex flex-col justify-end bg-slate-950/40 backdrop-blur-[4px] animate-in fade-in duration-300">
            <div 
              onClick={() => setIsSupplierDrawerOpen(false)}
              className="absolute inset-0" 
            />
            <div className="relative w-full max-h-[85%] bg-white rounded-t-[2.5rem] shadow-[0_-30px_100px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-500">
              <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mt-3 mb-1" />
              
              <div className="shrink-0 p-6 border-b border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center text-[#003366]">
                    <Factory size={22} />
                  </div>
                  <h3 className="text-xl font-black text-[#003366] tracking-tight">เลือกผู้จัดจำหน่าย</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSupplierDrawerOpen(false)}
                  className="h-10 w-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center active:scale-90"
                >
                  <X className="h-5 w-5" strokeWidth={3} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3 no-scrollbar">
                {suppliers.map(s => {
                  const isSelected = supplierId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSupplierId(s.id);
                        setSupplierName(s.name);
                        setIsSupplierDrawerOpen(false);
                      }}
                      className={`group w-full flex items-center justify-between p-5 rounded-2xl border transition-all text-left active:scale-[0.98] ${
                        isSelected 
                          ? "bg-indigo-50/50 border-[#003366] shadow-md" 
                          : "bg-white border-slate-100 hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-11 w-11 rounded-xl flex items-center justify-center transition-all ${
                          isSelected ? "bg-white text-[#003366] shadow-sm" : "bg-slate-50 text-slate-300 group-hover:text-indigo-400"
                        }`}>
                          <Factory size={20} />
                        </div>
                        <div>
                          <p className={`font-black text-base ${isSelected ? "text-slate-900" : "text-slate-600"}`}>{s.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Code: {s.code}</p>
                        </div>
                      </div>
                      <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? "bg-[#003366] border-[#003366]" : "border-slate-100"
                      }`}>
                        {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={5} />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="shrink-0 p-6 bg-slate-50/50 border-t border-slate-100" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>
                <button
                  type="button"
                  onClick={() => setIsSupplierDrawerOpen(false)}
                  className="w-full h-14 bg-white text-slate-600 border border-slate-200 rounded-2xl font-black text-base active:scale-95"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
