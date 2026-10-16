"use client";

import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CirclePlus, PencilLine, Save, X } from "lucide-react";
import { createSupplierAction, updateSupplierAction } from "@/app/(workspace)/settings/suppliers/actions";
import type { SupplierActionState } from "@/app/(workspace)/settings/suppliers/actions";
import { CustomerAddressFields } from "@/components/settings/customer-address-fields";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelHeader,
  settingsFieldLabelClass,
  settingsInputClass,
} from "@/components/settings/settings-ui";
import type { SettingsSupplier } from "@/lib/settings/admin";

type SupplierFormProps = {
  defaultCode?: string;
  initialSupplier?: SettingsSupplier;
  returnHref: string;
};

const initialState: SupplierActionState = {
  status: "idle",
  message: "",
};

function getInputClass(hasError: boolean) {
  return `${settingsInputClass} ${hasError ? "border-red-300 ring-1 ring-red-200" : ""}`;
}

export function SupplierForm({
  defaultCode = "",
  initialSupplier,
  returnHref,
}: SupplierFormProps) {
  const router = useRouter();
  const isEditMode = Boolean(initialSupplier);
  const action = initialSupplier
    ? updateSupplierAction.bind(null, initialSupplier.id)
    : createSupplierAction;
  const [state, formAction, isPending] = useActionState(
    action,
    initialState,
  );
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const hasSubmittedRef = useRef(false);

  function closeModal() {
    router.replace(returnHref);
  }

  const handleSuccess = useEffectEvent(() => {
    startTransition(() => {
      router.replace(returnHref);
      router.refresh();
    });
  });

  useEffect(() => {
    if (state.status === "success") {
      handleSuccess();
    }
  }, [state.status]);

  const showFeedback = hasSubmitted && state.status !== "idle";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3 sm:p-4">
      <div className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              {isEditMode ? "แก้ไขผู้ขาย" : "เพิ่มผู้ขาย"}
            </p>
            <div className="mt-1 flex items-center gap-2 text-slate-950">
              {isEditMode ? (
                <PencilLine className="h-6 w-6 text-[#003366]" strokeWidth={2.2} />
              ) : (
                <CirclePlus className="h-6 w-6 text-[#003366]" strokeWidth={2.2} />
              )}
              <h3 className="text-2xl font-semibold tracking-[-0.02em]">
                {isEditMode ? initialSupplier?.name : "รายการผู้ขายใหม่"}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={closeModal}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <form
          action={formAction}
          onSubmit={() => {
            if (!hasSubmittedRef.current) {
              hasSubmittedRef.current = true;
              setHasSubmitted(true);
            }
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {showFeedback ? (
            <div className="shrink-0 px-5 pt-5 sm:px-6 sm:pt-6">
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  state.status === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {state.message}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            <div className="space-y-8">
              <SettingsPanel>
                <SettingsPanelHeader icon="factory" title="ข้อมูลผู้ขาย" description="" />
                <SettingsPanelBody className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className={settingsFieldLabelClass} htmlFor="supplier-code">
                      รหัสผู้ขาย
                    </label>
                    <input
                      id="supplier-code"
                      name="supplierCode"
                      required
                      readOnly
                      defaultValue={initialSupplier?.code ?? defaultCode}
                      className={getInputClass(false)}
                      placeholder="TYV001"
                    />
                    <p className="text-sm text-slate-500">
                      ระบบกำหนดรหัสผู้ขายให้อัตโนมัติตามลำดับถัดไป
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className={settingsFieldLabelClass} htmlFor="supplier-name">
                      ชื่อผู้ขาย / บริษัท / โรงงาน
                    </label>
                    <input
                      id="supplier-name"
                      name="name"
                      required
                      defaultValue={initialSupplier?.name ?? ""}
                      className={getInputClass(false)}
                      placeholder="กรอกชื่อผู้ขาย"
                    />
                  </div>
                </SettingsPanelBody>
              </SettingsPanel>

              <CustomerAddressFields
                showFieldErrors={false}
                addressError={undefined}
                initialAddress={initialSupplier?.addressDraft}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-[#003366] px-5 py-3 text-sm font-medium text-white shadow-[0_12px_30px_rgba(0,51,102,0.22)] transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" strokeWidth={2.2} />
              บันทึกผู้ขาย
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
