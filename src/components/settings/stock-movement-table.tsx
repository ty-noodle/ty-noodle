import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";
import type { StockMovementRow } from "@/lib/stock/admin";

type StockMovementTableProps = {
  movementRows: StockMovementRow[];
};

function formatQuantity(value: number) {
  return value.toLocaleString("th-TH", {
    maximumFractionDigits: 3,
  });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(date);
  const [year, month, day] = datePart.split("-");
  const timePart = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(date);
  return `${day}/${month}/${Number.parseInt(year, 10) + 543} ${timePart}`;
}

function getMovementTone(movementType: string) {
  if (movementType === "receipt") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (movementType === "reserve") {
    return "bg-amber-50 text-amber-700";
  }

  if (movementType === "issue") {
    return "bg-rose-50 text-rose-700";
  }

  if (movementType === "release") {
    return "bg-sky-50 text-sky-700";
  }

  return "bg-slate-100 text-slate-600";
}

function getMovementLabel(movementType: string) {
  if (movementType === "receipt") {
    return "รับเข้า";
  }

  if (movementType === "reserve") {
    return "จองจากออเดอร์";
  }

  if (movementType === "issue") {
    return "ตัดส่งสินค้า";
  }

  if (movementType === "release") {
    return "คืนจอง";
  }

  return "ปรับสต็อก";
}

export function StockMovementTable({ movementRows }: StockMovementTableProps) {
  return (
    <SettingsPanel>
      <div className="border-b border-slate-100 px-6 py-5">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-slate-950">
          การเคลื่อนไหวสต็อก
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          ช่วยให้เช็กย้อนหลังได้ทันทีว่าแต่ละสินค้าถูกเพิ่มหรือลดจากรายการไหน
        </p>
      </div>

      <SettingsPanelBody className="p-0">
        {movementRows.length > 0 ? (
          <>
            <div className="space-y-3 p-4 md:hidden">
              {movementRows.map((movement) => (
                <article
                  key={movement.id}
                  className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-semibold text-slate-950">
                        {movement.productName}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{movement.sku}</p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getMovementTone(movement.movementType)}`}
                    >
                      {getMovementLabel(movement.movementType)}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-slate-500">{formatDateTime(movement.createdAt)}</p>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        จำนวน
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {movement.quantityDelta > 0 ? "+" : ""}
                        {formatQuantity(movement.quantityDelta)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        ก่อน
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {formatQuantity(movement.stockBefore)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        หลัง
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {formatQuantity(movement.stockAfter)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        อ้างอิง
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-700">
                        {movement.referenceNumber ?? movement.notes ?? "-"}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      วันที่
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      สินค้า
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      ประเภท
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      จำนวน
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      ก่อน
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      หลัง
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      อ้างอิง
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movementRows.map((movement) => (
                    <tr key={movement.id} className="align-middle">
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {formatDateTime(movement.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{movement.productName}</p>
                          <p className="text-xs text-slate-500">{movement.sku}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getMovementTone(movement.movementType)}`}
                        >
                          {getMovementLabel(movement.movementType)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-950">
                        {movement.quantityDelta > 0 ? "+" : ""}
                        {formatQuantity(movement.quantityDelta)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {formatQuantity(movement.stockBefore)}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-950">
                        {formatQuantity(movement.stockAfter)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {movement.referenceNumber ?? movement.notes ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-6">
            <SettingsEmptyState className="py-14">
              ยังไม่มีประวัติการเคลื่อนไหวสต็อก กด “รับสินค้าเข้า” เพื่อเริ่มบันทึกรายการแรก
            </SettingsEmptyState>
          </div>
        )}
      </SettingsPanelBody>
    </SettingsPanel>
  );
}
