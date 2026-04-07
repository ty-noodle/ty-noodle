"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import {
  SettingsPanel,
  SettingsPanelBody,
  settingsFieldLabelClass,
  settingsInputClass,
} from "@/components/settings/settings-ui";
import { SearchableSelect } from "@/components/settings/searchable-select";

type AddressDraft = {
  addressDetails: string;
  districtCode: string;
  postalCode: string;
  provinceCode: string;
  subdistrictCode: string;
};

type CustomerAddressFieldsProps = {
  addressError?: string;
  showFieldErrors: boolean;
};

type GeographyOption = {
  code: number;
  label: string;
  postalCode?: number;
};

const INITIAL_ADDRESS_DRAFT: AddressDraft = {
  addressDetails: "",
  districtCode: "",
  postalCode: "",
  provinceCode: "",
  subdistrictCode: "",
};

function joinAddressParts(parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join(" ");
}

async function getOptions(path: string, signal: AbortSignal) {
  const response = await fetch(path, { signal });

  if (!response.ok) {
    throw new Error("Failed to load geography data.");
  }

  const payload = (await response.json()) as { options?: GeographyOption[] };
  return payload.options ?? [];
}

export function CustomerAddressFields({
  addressError,
  showFieldErrors,
}: CustomerAddressFieldsProps) {
  const [draft, setDraft] = useState(INITIAL_ADDRESS_DRAFT);
  const [provinceOptions, setProvinceOptions] = useState<GeographyOption[]>([]);
  const [districtOptions, setDistrictOptions] = useState<GeographyOption[]>([]);
  const [subdistrictOptions, setSubdistrictOptions] = useState<GeographyOption[]>([]);
  const [geographyStatus, setGeographyStatus] = useState<"error" | "loading" | "ready">("loading");

  useEffect(() => {
    const controller = new AbortController();

    void getOptions("/api/geography?level=provinces", controller.signal)
      .then((options) => {
        setProvinceOptions(options);
        setGeographyStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setGeographyStatus("error");
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!draft.provinceCode) {
      return;
    }

    const controller = new AbortController();

    void getOptions(`/api/geography?level=districts&provinceCode=${draft.provinceCode}`, controller.signal)
      .then((options) => {
        setDistrictOptions(options);
        setGeographyStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setGeographyStatus("error");
      });

    return () => controller.abort();
  }, [draft.provinceCode]);

  useEffect(() => {
    if (!draft.provinceCode || !draft.districtCode) {
      return;
    }

    const controller = new AbortController();

    void getOptions(
      `/api/geography?level=subdistricts&provinceCode=${draft.provinceCode}&districtCode=${draft.districtCode}`,
      controller.signal,
    )
      .then((options) => {
        setSubdistrictOptions(options);
        setGeographyStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setGeographyStatus("error");
      });

    return () => controller.abort();
  }, [draft.districtCode, draft.provinceCode]);

  const provinceName =
    provinceOptions.find((option) => String(option.code) === draft.provinceCode)?.label ?? "";
  const districtName =
    districtOptions.find((option) => String(option.code) === draft.districtCode)?.label ?? "";
  const selectedSubdistrict =
    subdistrictOptions.find((option) => String(option.code) === draft.subdistrictCode) ?? null;
  const subdistrictName = selectedSubdistrict?.label ?? "";

  const addressPayload = useMemo(
    () =>
      JSON.stringify({
        addressDetails: draft.addressDetails,
        addressLine: draft.addressDetails,
        addressSummary: joinAddressParts([
          draft.addressDetails,
          subdistrictName ? `ตำบล/แขวง ${subdistrictName}` : "",
          districtName ? `อำเภอ/เขต ${districtName}` : "",
          provinceName ? `จังหวัด ${provinceName}` : "",
          draft.postalCode,
        ]),
        districtCode: draft.districtCode,
        districtName,
        postalCode: draft.postalCode,
        provinceCode: draft.provinceCode,
        provinceName,
        subdistrictCode: draft.subdistrictCode,
        subdistrictName,
      }),
    [districtName, draft, provinceName, subdistrictName],
  );

  function updateDraft<K extends keyof AddressDraft>(field: K, value: AddressDraft[K]) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleProvinceChange(nextProvinceCode: string) {
    setGeographyStatus(nextProvinceCode ? "loading" : "ready");
    setDistrictOptions([]);
    setSubdistrictOptions([]);
    setDraft((current) => ({
      ...current,
      districtCode: "",
      postalCode: "",
      provinceCode: nextProvinceCode,
      subdistrictCode: "",
    }));
  }

  function handleDistrictChange(nextDistrictCode: string) {
    setGeographyStatus(nextDistrictCode ? "loading" : "ready");
    setSubdistrictOptions([]);
    setDraft((current) => ({
      ...current,
      districtCode: nextDistrictCode,
      postalCode: "",
      subdistrictCode: "",
    }));
  }

  function handleSubdistrictChange(nextSubdistrictCode: string) {
    const option =
      subdistrictOptions.find((item) => String(item.code) === nextSubdistrictCode) ?? null;

    setDraft((current) => ({
      ...current,
      postalCode: String(option?.postalCode ?? ""),
      subdistrictCode: nextSubdistrictCode,
    }));
  }

  return (
    <SettingsPanel>
      <input type="hidden" name="addressPayload" value={addressPayload} />

      <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
        <MapPin className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
        <h2 className="text-xl font-semibold text-slate-900">รายละเอียดที่อยู่</h2>
      </div>

      <SettingsPanelBody className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {geographyStatus === "loading" ? (
          <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            กำลังโหลดข้อมูลจังหวัด อำเภอ และตำบลจากเซิร์ฟเวอร์...
          </div>
        ) : null}

        {geographyStatus === "error" ? (
          <div className="md:col-span-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            โหลดข้อมูลที่อยู่ไม่สำเร็จ ลองปิดหน้าต่างแล้วเปิดใหม่อีกครั้ง
          </div>
        ) : null}

        <div className="md:col-span-2">
          <label className={settingsFieldLabelClass} htmlFor="address-details">
            รายละเอียดที่อยู่
          </label>
          <textarea
            id="address-details"
            value={draft.addressDetails}
            onChange={(event) => updateDraft("addressDetails", event.target.value)}
            rows={5}
            className={`${settingsInputClass} min-h-36 resize-y`}
            placeholder="พิมพ์รายละเอียดที่อยู่ร้านค้าได้เลย เช่น เลขที่ ซอย ถนน อาคาร หรือจุดสังเกต"
          />
        </div>

        <AddressSelectField id="province" label="จังหวัด">
          <SearchableSelect
            id="province"
            value={draft.provinceCode}
            onChange={handleProvinceChange}
            disabled={geographyStatus === "error"}
            options={provinceOptions}
            placeholder="พิมพ์ค้นหาจังหวัด"
          />
        </AddressSelectField>

        <AddressSelectField id="district" label="อำเภอ / เขต">
          <SearchableSelect
            id="district"
            value={draft.districtCode}
            onChange={handleDistrictChange}
            disabled={!draft.provinceCode || geographyStatus === "error"}
            options={districtOptions}
            placeholder="พิมพ์ค้นหาอำเภอ / เขต"
          />
        </AddressSelectField>

        <AddressSelectField id="subdistrict" label="ตำบล / แขวง">
          <SearchableSelect
            id="subdistrict"
            value={draft.subdistrictCode}
            onChange={handleSubdistrictChange}
            disabled={!draft.districtCode || geographyStatus === "error"}
            options={subdistrictOptions}
            placeholder="พิมพ์ค้นหาตำบล / แขวง"
          />
        </AddressSelectField>

        <div>
          <label className={settingsFieldLabelClass} htmlFor="postal-code">
            รหัสไปรษณีย์
          </label>
          <input
            id="postal-code"
            value={draft.postalCode}
            onChange={(event) => updateDraft("postalCode", event.target.value)}
            className={settingsInputClass}
            placeholder="เลือกรายการตำบลเพื่อเติมอัตโนมัติ"
          />
        </div>

        {showFieldErrors && addressError ? (
          <div className="md:col-span-2">
            <p className="text-sm text-red-600">{addressError}</p>
          </div>
        ) : null}
      </SettingsPanelBody>
    </SettingsPanel>
  );
}

type AddressSelectFieldProps = {
  children: ReactNode;
  id: string;
  label: string;
};

function AddressSelectField({ children, id, label }: AddressSelectFieldProps) {
  return (
    <div>
      <label className={settingsFieldLabelClass} htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}
