"use client";

import Image from "next/image";
import type { Customer } from "@/app/order/customer/order-client-types";

type ProfileInfo = {
  displayName?: string | null;
  pictureUrl?: string | null;
  userId?: string | null;
};

type OrderProfileViewProps = {
  linkedCustomer: Customer | null;
  onLogout: () => void;
  profile: ProfileInfo | null | undefined;
};

export function OrderProfileView({
  linkedCustomer,
  onLogout,
  profile,
}: OrderProfileViewProps) {
  return (
    <section className="p-6">
      <div className="flex flex-col items-center rounded-[2.5rem] border border-slate-50 bg-white p-8 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)]">
        <div className="relative mb-4 h-24 w-24 overflow-hidden rounded-full border-4 border-white shadow-xl">
          <Image
            src={profile?.pictureUrl || "/placeholders/profile-placeholder.svg"}
            alt="Profile"
            fill
            sizes="96px"
            className="h-full w-full object-cover"
          />
        </div>
        <h2 className="text-xl font-bold text-slate-900">{profile?.displayName || "ลูกค้า"}</h2>

        <div className="my-6 h-px w-full bg-slate-100" />

        <div className="w-full space-y-4">
          <div className="flex items-center gap-3 text-slate-600">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef4fa]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#003366]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">ร้านค้าที่ผูกไว้</p>
              <p className="font-bold text-slate-800">{linkedCustomer?.name || "-"}</p>
              <p className="text-xs text-slate-500">{linkedCustomer?.customer_code}</p>
            </div>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="mt-10 w-full rounded-2xl border border-red-100 bg-red-50/30 py-4 text-sm font-bold text-red-500 transition-colors hover:bg-red-50"
        >
          ออกจากระบบ
        </button>
      </div>

      <div className="mt-8 p-4 text-center">
        <p className="text-xs text-slate-300">LINE ID: {profile?.userId}</p>
      </div>
    </section>
  );
}
