"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { upsertStoreProductPrice } from "@/app/dashboard/settings/actions";
import { confirmBelowCostSave } from "@/components/pricing/price-guard";
import { SubmitButton } from "@/components/settings/submit-button";
import { settingsInputClass } from "@/components/settings/settings-ui";

type SaleUnitOption = {
  effectiveCostPrice: number;
  id: string;
  label: string;
  productName: string;
  sku: string;
};

type CustomerOption = {
  code: string;
  id: string;
  name: string;
};

type PriceWarningFormProps = {
  customers: CustomerOption[];
  saleUnits: SaleUnitOption[];
};

export function PriceWarningForm({ customers, saleUnits }: PriceWarningFormProps) {
  const [selectedSaleUnitId, setSelectedSaleUnitId] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedUnit = saleUnits.find((u) => u.id === selectedSaleUnitId);
  const price = parseFloat(priceValue) || 0;
  const isBelowCost = selectedUnit !== undefined && price > 0 && price < selectedUnit.effectiveCostPrice;

  function handleAction(formData: FormData) {
    if (
      isBelowCost &&
      selectedUnit &&
      !confirmBelowCostSave({
        productName: selectedUnit.productName,
        saleUnitLabel: selectedUnit.label,
        salePrice: price,
        effectiveCostPrice: selectedUnit.effectiveCostPrice,
      })
    ) {
      return;
    }

    startTransition(async () => {
      await upsertStoreProductPrice(formData);
      setSelectedSaleUnitId("");
      setPriceValue("");
    });
  }

  return (
    <form action={handleAction} aria-busy={isPending}>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_0.8fr_auto]">
        <select
          name="productSaleUnitId"
          required
          value={selectedSaleUnitId}
          onChange={(e) => setSelectedSaleUnitId(e.target.value)}
          className={settingsInputClass}
        >
          <option value="" disabled>
            ค้นหาหรือเลือกสินค้าเพื่อผูกราคากับร้านนี้
          </option>
          {saleUnits.map((saleUnit) => (
            <option key={saleUnit.id} value={saleUnit.id}>
              {saleUnit.sku} - {saleUnit.productName} ({saleUnit.label})
            </option>
          ))}
        </select>

        <select
          name="customerId"
          required
          defaultValue=""
          className={settingsInputClass}
        >
          <option value="" disabled>
            เลือกร้านค้า
          </option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.code} - {customer.name}
            </option>
          ))}
        </select>

        <div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
              ฿
            </span>
            <input
              name="salePrice"
              type="number"
              min="0"
              step="0.01"
              required
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
              className={`w-full rounded-lg border p-3 pl-7 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#003366] ${
                isBelowCost
                  ? "border-amber-300 bg-amber-50"
                  : "border-slate-200 bg-white"
              }`}
              placeholder="0.00"
            />
          </div>
        </div>

        <SubmitButton className="h-full px-5">บันทึกราคา</SubmitButton>
      </div>

      {isBelowCost && selectedUnit && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          ราคาขายต่ำกว่าต้นทุน — ต้นทุนต่อ{selectedUnit.label}: ฿
          {selectedUnit.effectiveCostPrice.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
        </div>
      )}
    </form>
  );
}
