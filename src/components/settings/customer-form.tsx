"use client";

import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CirclePlus, Save, X } from "lucide-react";
import { createCustomerAction } from "@/app/settings/customers/actions";
import type { CreateCustomerActionState } from "@/app/settings/customers/actions";
import { CustomerAddressFields } from "@/components/settings/customer-address-fields";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelHeader,
  settingsFieldLabelClass,
  settingsInputClass,
} from "@/components/settings/settings-ui";
import type { SettingsVehicle } from "@/lib/settings/admin";

type CustomerFormProps = {
  defaultCode?: string;
  returnHref: string;
  vehicles: SettingsVehicle[];
};

const initialCreateCustomerState: CreateCustomerActionState = {
  fieldErrors: {},
  message: "",
  status: "idle",
};

function getInputClass(hasError: boolean) {
  return `${settingsInputClass} ${hasError ? "border-red-300 ring-1 ring-red-200" : ""}`;
}

export function CustomerForm({
  defaultCode = "",
  returnHref,
  vehicles,
}: CustomerFormProps) {
  const router = useRouter();
  const [actionState, formAction, isPending] = useActionState(
    createCustomerAction,
    initialCreateCustomerState,
  );
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const hasSubmittedRef = useRef(false);
  const fieldErrors =
    actionState && typeof actionState === "object" && "fieldErrors" in actionState
      ? (actionState.fieldErrors ?? initialCreateCustomerState.fieldErrors)
      : initialCreateCustomerState.fieldErrors;
  const message =
    actionState && typeof actionState === "object" && "message" in actionState
      ? (actionState.message ?? initialCreateCustomerState.message)
      : initialCreateCustomerState.message;
  const status =
    actionState && typeof actionState === "object" && "status" in actionState
      ? (actionState.status ?? initialCreateCustomerState.status)
      : initialCreateCustomerState.status;

  const state = {
    fieldErrors,
    message,
    status,
  };

  function closeModal() {
    router.replace(returnHref);
  }

  const handleCreateSuccess = useEffectEvent(() => {
    startTransition(() => {
      router.replace(returnHref);
      router.refresh();
    });
  });

  useEffect(() => {
    if (state.status === "success") {
      handleCreateSuccess();
    }
  }, [state.status]);

  const showFeedback = hasSubmitted && state.status !== "idle";
  const showFieldErrors = hasSubmitted && state.status === "error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 sm:p-4">
      <div className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              เพิ่มร้านค้า
            </p>
            <div className="mt-1 flex items-center gap-2 text-slate-950">
              <CirclePlus className="h-6 w-6 text-[#003366]" strokeWidth={2.2} />
              <h3 className="text-2xl font-semibold tracking-[-0.02em]">รายการร้านค้าใหม่</h3>
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
                <SettingsPanelHeader icon="house" title="ข้อมูลร้านค้า" description="" />
                <SettingsPanelBody className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className={settingsFieldLabelClass} htmlFor="customer-code">
                      รหัสร้าน
                    </label>
                    <input
                      id="customer-code"
                      name="customerCode"
                      required
                      readOnly
                      defaultValue={defaultCode}
                      className={getInputClass(showFieldErrors && Boolean(fieldErrors?.customerCode))}
                      placeholder="TYS001"
                    />
                    <p className="text-sm text-slate-500">
                      ระบบกำหนดรหัสร้านค้าให้อัตโนมัติตามลำดับถัดไป
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className={settingsFieldLabelClass} htmlFor="customer-name">
                      ชื่อร้าน
                    </label>
                    <input
                      id="customer-name"
                      name="name"
                      required
                      className={getInputClass(showFieldErrors && Boolean(fieldErrors?.name))}
                      placeholder="กรอกชื่อร้านค้า"
                    />
                  </div>

                  <div className="flex flex-col gap-2 md:col-span-2">
                    <label className={settingsFieldLabelClass} htmlFor="default-vehicle-id">
                      รถประจำร้าน (ถ้ามี)
                    </label>
                    <select
                      id="default-vehicle-id"
                      name="defaultVehicleId"
                      defaultValue=""
                      className={getInputClass(showFieldErrors && Boolean(fieldErrors?.defaultVehicleId))}
                    >
                      <option value="">ยังไม่ได้กำหนดรถประจำร้าน</option>
                      {vehicles
                        .filter((vehicle) => vehicle.isActive)
                        .map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </SettingsPanelBody>
              </SettingsPanel>

              <CustomerAddressFields
                showFieldErrors={showFieldErrors}
                addressError={fieldErrors?.address}
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
              บันทึกร้านค้า
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
