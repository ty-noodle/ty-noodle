"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Phone, UserRound, X } from "lucide-react";
import type { CustomerInquiryRecord } from "@/lib/customer-inquiries";

type CustomerInquiryModalProps = {
  inquiry: CustomerInquiryRecord | null;
};

function formatThaiDateTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(new Date(value));
}

export function CustomerInquiryModal({ inquiry }: CustomerInquiryModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(inquiry));

  const sanitizedPhone = useMemo(
    () => inquiry?.customerPhone.replace(/[-\s]/g, "") ?? "",
    [inquiry?.customerPhone],
  );

  if (!inquiry || !open) {
    return null;
  }

  function closeModal() {
    setOpen(false);
    router.replace("/settings/customer-data", { scroll: false });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-[linear-gradient(160deg,#f0fdfa_0%,#ffffff_100%)] px-5 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-600">
              ลูกค้าใหม่
            </p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
              โทรหาลูกค้า
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              ระบบพาคุณมาที่ข้อมูลที่ลูกค้าส่งเข้ามาจากหน้า LINE
            </p>
          </div>

          <button
            type="button"
            onClick={closeModal}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500 text-white shadow-[0_12px_28px_rgba(20,184,166,0.24)]">
                <UserRound className="h-6 w-6" strokeWidth={2.1} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-slate-500">ชื่อลูกค้า</p>
                <p className="truncate text-lg font-bold text-slate-950">{inquiry.customerName}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
                <Phone className="h-4 w-4 shrink-0 text-teal-600" strokeWidth={2.2} />
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
                    เบอร์โทร
                  </p>
                  <p className="text-base font-semibold text-slate-900">{inquiry.customerPhone}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
                <CalendarDays className="h-4 w-4 shrink-0 text-[#003366]" strokeWidth={2.2} />
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
                    เวลาที่ส่งข้อมูล
                  </p>
                  <p className="text-sm font-semibold text-slate-800">
                    {formatThaiDateTime(inquiry.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <a
            href={`tel:${sanitizedPhone}`}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 px-5 py-4 text-base font-bold text-white shadow-[0_18px_40px_rgba(20,184,166,0.28)] transition hover:bg-teal-600 active:scale-[0.98]"
          >
            <Phone className="h-5 w-5" strokeWidth={2.2} />
            โทรหาลูกค้า
          </a>

          <button
            type="button"
            onClick={closeModal}
            className="flex w-full items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            ปิดหน้าต่างนี้
          </button>
        </div>
      </div>
    </div>
  );
}
