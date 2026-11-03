"use client";

import { useTransition, useState } from "react";
import { deleteProduct } from "@/app/(workspace)/dashboard/settings/actions";
import { AlertTriangle, Trash2, X, AlertCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

type DeleteProductButtonProps = {
  formId: string;
  productName: string;
  triggerClassName?: string;
};

export function DeleteProductButton({ formId, productName, triggerClassName }: DeleteProductButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);


  const confirmDelete = async () => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const formData = new FormData(form);
    
    startTransition(async () => {
      setErrorMsg(null);
      const result = await deleteProduct(formData);
      if (!result.success) {
        setErrorMsg(result.error || "ไม่สามารถลบสินค้าได้ในขณะนี้");
      } else {
        setIsOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErrorMsg(null);
          setIsOpen(true);
        }}
        disabled={isPending}
        className={triggerClassName || "action-touch-safe inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"}
      >
        <Trash2 className="h-3.5 w-3.5" />
        ลบ
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => !isPending && setIsOpen(false)}
          />
          
          {/* Modal Content */}
          <div className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] bg-[#580000] text-white shadow-[0_30px_100px_rgba(0,0,0,0.5)] border border-white/10 animate-in zoom-in-95 slide-in-from-bottom-8 duration-500">
            {/* Header / Icon */}
            <div className="flex flex-col items-center pt-10 pb-6">
              <div className="relative">
                <div className="absolute -inset-4 bg-amber-400/20 rounded-full blur-xl animate-pulse" />
                <div className="relative h-20 w-20 rounded-[2rem] bg-amber-400 flex items-center justify-center text-[#580000] shadow-2xl shadow-amber-400/20">
                  <AlertTriangle size={48} strokeWidth={2.5} />
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-10 pb-8 text-center">
              <h3 className="text-2xl font-black tracking-tight">ยืนยันการลบสินค้า?</h3>
              <div className="mt-4 space-y-3">
                <p className="text-lg font-bold text-white/90 leading-relaxed">
                  คุณกำลังจะลบรายการ <span className="text-amber-300">&quot;{productName}&quot;</span> ออกจากหน้าระบบ
                </p>
                <p className="text-sm font-medium text-white/60 leading-relaxed bg-black/20 p-4 rounded-2xl border border-white/5">
                  หมายเหตุ: หากสินค้านี้เคยมีประวัติการขายหรือรับเข้าสต็อก ระบบจะเก็บข้อมูลเหล่านั้นไว้ในรายงานเพื่อความถูกต้องทางบัญชี แต่สินค้าจะถูกลบออกจากหน้ารายการปกติ
                </p>
              </div>

              {errorMsg && (
                <div className="mt-6 p-5 rounded-3xl bg-rose-500/20 border border-rose-500/30 flex items-start gap-3 text-left animate-in slide-in-from-top-2">
                  <AlertCircle className="h-5 w-5 shrink-0 text-rose-300" />
                  <p className="text-[13px] font-bold text-rose-100 leading-snug">{errorMsg}</p>
                </div>
              )}
            </div>

            {/* Footer / Actions */}
            <div className="flex flex-col gap-3 px-8 pb-10">
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isPending}
                className="h-14 w-full bg-white text-[#580000] rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="h-5 w-5" strokeWidth={3} />
                    ลบออกถาวร
                  </>
                )}
              </button>
              
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
                className="h-14 w-full bg-white/5 hover:bg-white/10 text-white/70 rounded-2xl font-black text-lg active:scale-95 transition-all"
              >
                ยกเลิก
              </button>
            </div>

            {/* Close Button */}
            <button
              onClick={() => !isPending && setIsOpen(false)}
              className="absolute top-6 right-6 h-10 w-10 flex items-center justify-center rounded-xl bg-black/20 text-white/40 hover:text-white hover:bg-black/40 transition-all"
            >
              <X size={20} strokeWidth={3} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
