"use client";

import { useActionState, useRef, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { changeLoginPinAction } from "@/app/(workspace)/settings/login-pin/actions";

const initialChangeLoginPinState = {
  status: "idle" as const,
  message: "",
};

function PinInput({
  label,
  name,
}: {
  label: string;
  name: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
      <input
        name={name}
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        pattern="[0-9]*"
        className="h-16 w-full rounded-2xl border border-slate-200 bg-white px-5 text-center text-3xl font-black tracking-[0.45em] text-[#003366] shadow-sm outline-none transition placeholder:tracking-normal placeholder:text-slate-300 focus:border-[#003366] focus:ring-4 focus:ring-[#003366]/10"
        placeholder="000000"
      />
    </label>
  );
}

export function PinSettingsForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    changeLoginPinAction,
    initialChangeLoginPinState,
  );
  const [dismissedSuccessId, setDismissedSuccessId] = useState<string | null>(null);
  const showSuccess =
    state.status === "success" &&
    typeof state.successId === "string" &&
    dismissedSuccessId !== state.successId;

  return (
    <>
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] sm:p-7">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#003366]/10 text-[#003366]">
            <KeyRound className="h-6 w-6" strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-black text-slate-950">ตั้งค่า PIN ใหม่</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">ใช้ตัวเลข 6 หลัก</p>
          </div>
        </div>

        <form ref={formRef} action={formAction} className="mt-6 grid gap-5">
          <PinInput label="PIN ใหม่" name="newPin" />
          <PinInput label="ยืนยัน PIN ใหม่" name="confirmPin" />

          {state.status === "error" ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {state.message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#003366] px-6 text-base font-black text-white shadow-[0_18px_42px_rgba(0,51,102,0.24)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
            ) : (
              <ShieldCheck className="h-5 w-5" strokeWidth={2.5} />
            )}
            บันทึก PIN
          </button>
        </form>
      </section>

      {showSuccess ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-[30px] bg-white p-6 shadow-[0_26px_80px_rgba(15,23,42,0.28)]">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" strokeWidth={2.4} />
              </span>
              <div>
                <h3 className="text-xl font-black text-slate-950">เปลี่ยน PIN สำเร็จ</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  จะใช้งานต่อ หรือออกจากระบบเพื่อเข้าใหม่ด้วย PIN ล่าสุด
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setDismissedSuccessId(state.successId ?? null);
                  formRef.current?.reset();
                }}
                className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                ใช้งานต่อ
              </button>
              <form action={signOut}>
                <button
                  type="submit"
                  className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#003366] px-4 text-sm font-black text-white transition hover:bg-[#00264d]"
                >
                  <LogOut className="h-4 w-4" strokeWidth={2.4} />
                  ออกจากระบบ
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
