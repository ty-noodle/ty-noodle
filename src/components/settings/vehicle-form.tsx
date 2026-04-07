"use client";

import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CirclePlus, PencilLine, Save, Truck, UserRound, X } from "lucide-react";
import { createVehicleAction, updateVehicleAction } from "@/app/settings/vehicles/actions";
import type { CreateVehicleActionState } from "@/app/settings/vehicles/actions";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelHeader,
  settingsFieldLabelClass,
  settingsInputClass,
} from "@/components/settings/settings-ui";
import type { SettingsVehicle } from "@/lib/settings/admin";

type VehicleFormProps = {
  initialVehicle?: SettingsVehicle;
  returnHref: string;
};

const initialCreateVehicleState: CreateVehicleActionState = {
  fieldErrors: {},
  message: "",
  status: "idle",
};

function getInputClass(hasError: boolean) {
  return `${settingsInputClass} ${hasError ? "border-red-300 ring-1 ring-red-200" : ""}`;
}

export function VehicleForm({ initialVehicle, returnHref }: VehicleFormProps) {
  const router = useRouter();
  const action = initialVehicle
    ? updateVehicleAction.bind(null, initialVehicle.id)
    : createVehicleAction;
  const [actionState, formAction, isPending] = useActionState(action, initialCreateVehicleState);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const hasSubmittedRef = useRef(false);

  const fieldErrors =
    actionState && typeof actionState === "object" && "fieldErrors" in actionState
      ? (actionState.fieldErrors ?? initialCreateVehicleState.fieldErrors)
      : initialCreateVehicleState.fieldErrors;
  const message =
    actionState && typeof actionState === "object" && "message" in actionState
      ? (actionState.message ?? initialCreateVehicleState.message)
      : initialCreateVehicleState.message;
  const status =
    actionState && typeof actionState === "object" && "status" in actionState
      ? (actionState.status ?? initialCreateVehicleState.status)
      : initialCreateVehicleState.status;

  const state = {
    fieldErrors,
    message,
    status,
  };

  const isEditMode = Boolean(initialVehicle);

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
  const showFieldErrors = hasSubmitted && state.status === "error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 sm:p-4">
      <div className="flex max-h-[96dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              {isEditMode ? "แก้ไขรถ" : "เพิ่มรถ"}
            </p>
            <div className="mt-1 flex items-center gap-2 text-slate-950">
              {isEditMode ? (
                <PencilLine className="h-6 w-6 text-[#003366]" strokeWidth={2.2} />
              ) : (
                <CirclePlus className="h-6 w-6 text-[#003366]" strokeWidth={2.2} />
              )}
              <h3 className="text-2xl font-semibold tracking-[-0.02em]">
                {isEditMode ? "แก้ไขข้อมูลรถ" : "รายการรถใหม่"}
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
            <SettingsPanel>
              <SettingsPanelHeader
                icon="truck"
                title="ข้อมูลรถ"
                description="บังคับกรอกเฉพาะชื่อรถ ส่วนทะเบียนและชื่อคนขับใส่ภายหลังหรือเว้นว่างไว้ได้"
              />
              <SettingsPanelBody className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="flex flex-col gap-2 md:col-span-2">
                  <label className={settingsFieldLabelClass} htmlFor="vehicle-name">
                    ชื่อรถ
                  </label>
                  <div className="relative">
                    <Truck className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                    <input
                      id="vehicle-name"
                      name="name"
                      required
                      defaultValue={initialVehicle?.name ?? ""}
                      className={`${getInputClass(showFieldErrors && Boolean(fieldErrors?.name))} pl-10`}
                      placeholder="เช่น รถส่งเช้า, รถกระบะ 1"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className={settingsFieldLabelClass} htmlFor="vehicle-license-plate">
                    ทะเบียนรถ (ไม่บังคับ)
                  </label>
                  <input
                    id="vehicle-license-plate"
                    name="licensePlate"
                    defaultValue={initialVehicle?.licensePlate ?? ""}
                    className={settingsInputClass}
                    placeholder="เช่น 1กข 1234"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className={settingsFieldLabelClass} htmlFor="vehicle-driver-name">
                    ชื่อคนขับ (ไม่บังคับ)
                  </label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                    <input
                      id="vehicle-driver-name"
                      name="driverName"
                      defaultValue={initialVehicle?.driverName ?? ""}
                      className={`${settingsInputClass} pl-10`}
                      placeholder="เช่น พี่แดง"
                    />
                  </div>
                </div>
              </SettingsPanelBody>
            </SettingsPanel>
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
              {isEditMode ? "บันทึกการแก้ไข" : "บันทึกรถ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
