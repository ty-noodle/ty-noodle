// ─── Types ────────────────────────────────────────────────────────────────────

export type PackingListStore = {
  id: string;
  name: string;
  vehicleId: string | null;
  vehicleName: string | null;
};

export type PackingListProduct = {
  key: string; // sku||unit
  sku: string;
  name: string;
  unit: string;
};

export type PackingListVehicle = {
  id: string;
  name: string;
};

export type PackingListData = {
  date: string;
  dateLabel: string;
  organizationName: string;
  stores: PackingListStore[];
  products: PackingListProduct[];
  /** qty[productIdx][storeIdx] */
  qty: number[][];
  /** ordered list of vehicles (by sort_order) */
  vehicles: PackingListVehicle[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SHEET_W = "297mm";
const SHEET_H = "210mm";

// ─── Pagination helpers ───────────────────────────────────────────────────────

/** ≤20→1หน้า, 21-60→2หน้า (even split), 61+→ceil(n/20) */
function calcStorePageCount(n: number): number {
  if (n <= 20) return 1;
  if (n <= 60) return 2;
  return Math.ceil(n / 20);
}

/** ≤35→1หน้า, 36-70→2หน้า (25+25 for 50), 71+→ceil(n/35) */
function calcProductPageCount(n: number): number {
  if (n <= 35) return 1;
  if (n <= 70) return 2;
  return Math.ceil(n / 35);
}

/** Column width auto-fits: clamp between 7mm and 22mm */
function calcColWidth(storeCount: number): string {
  const raw = Math.floor(201 / storeCount);
  return `${Math.min(22, Math.max(7, raw))}mm`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Vehicle accent colours — cycles through a small palette
const VEHICLE_COLORS = ["#1e3a5f", "#065f46", "#7c2d12", "#4c1d95", "#1e3a5f"];
const UNASSIGNED_COLOR = "#64748b";

function vehicleColor(vehicleId: string | null, vehicles: PackingListVehicle[]): string {
  if (!vehicleId) return UNASSIGNED_COLOR;
  const idx = vehicles.findIndex((v) => v.id === vehicleId);
  return VEHICLE_COLORS[idx % VEHICLE_COLORS.length] ?? VEHICLE_COLORS[0];
}

// ─── Page definition ──────────────────────────────────────────────────────────

type PageDef = {
  vehicleId: string | null;
  vehicleName: string | null;
  accentColor: string;
  pageStores: PackingListStore[];
  pageStoreIndices: number[]; // into data.stores
  pageProducts: PackingListProduct[];
  pageProductIndices: number[]; // into data.products
  productChunkStartIdx: number; // 0-based within active products of this vehicle
  vehicleStoreCount: number;
  vehicleActiveProductCount: number;
  totalProductCount: number;
  vehicleTotal: number;
  globalPage: number;
  totalPages: number;
  storeChunk: number;
  storeTotalChunks: number;
  productChunk: number;
  productTotalChunks: number;
  dateLabel: string;
  orgName: string;
};

function buildPages(data: PackingListData): PageDef[] {
  const colTotals = data.stores.map((_, si) =>
    data.products.reduce((sum, _, pi) => sum + data.qty[pi][si], 0)
  );

  // Group stores by vehicle
  type Group = { vehicleId: string | null; vehicleName: string | null; storeIndices: number[] };
  const groupMap = new Map<string, Group>();

  // Preserve vehicle sort order: registered vehicles first, then unassigned
  for (const v of data.vehicles) {
    groupMap.set(v.id, { vehicleId: v.id, vehicleName: v.name, storeIndices: [] });
  }
  // Unassigned bucket
  groupMap.set("__unassigned__", { vehicleId: null, vehicleName: null, storeIndices: [] });

  data.stores.forEach((store, si) => {
    const key = store.vehicleId ?? "__unassigned__";
    if (!groupMap.has(key)) {
      // vehicle not in vehicles list (shouldn't happen) — add it
      groupMap.set(key, { vehicleId: store.vehicleId, vehicleName: store.vehicleName, storeIndices: [] });
    }
    groupMap.get(key)!.storeIndices.push(si);
  });

  // Remove empty groups
  const groups = Array.from(groupMap.values()).filter((g) => g.storeIndices.length > 0);

  const defs: Omit<PageDef, "globalPage" | "totalPages">[] = [];

  for (const group of groups) {
    const { vehicleId, vehicleName, storeIndices } = group;
    const accentColor = vehicleColor(vehicleId, data.vehicles);
    const vehicleTotal = storeIndices.reduce((s, si) => s + colTotals[si], 0);

    // Active products: have qty > 0 in at least one store of this vehicle
    const activeProdIndices = data.products
      .map((_, pi) => pi)
      .filter((pi) => storeIndices.some((si) => data.qty[pi][si] > 0));
    const activeProducts = activeProdIndices.map((pi) => data.products[pi]);

    // Store chunks
    const storeTotalChunks = calcStorePageCount(storeIndices.length);
    const storeChunkSize = Math.ceil(storeIndices.length / storeTotalChunks);
    const storeChunks = chunk(storeIndices, storeChunkSize);

    // Product chunks
    const productTotalChunks = calcProductPageCount(activeProducts.length);
    const prodChunkSize = Math.ceil(activeProducts.length / productTotalChunks);
    const productChunks = chunk(activeProducts, prodChunkSize).map((ps, i) => ({
      products: ps,
      indices: activeProdIndices.slice(i * prodChunkSize, (i + 1) * prodChunkSize),
    }));

    for (let sc = 0; sc < storeChunks.length; sc++) {
      for (let pc = 0; pc < productChunks.length; pc++) {
        const pageStoreIndices = storeChunks[sc];
        defs.push({
          vehicleId,
          vehicleName,
          accentColor,
          pageStores: pageStoreIndices.map((si) => data.stores[si]),
          pageStoreIndices,
          pageProducts: productChunks[pc].products,
          pageProductIndices: productChunks[pc].indices,
          productChunkStartIdx: pc * prodChunkSize,
          vehicleStoreCount: storeIndices.length,
          vehicleActiveProductCount: activeProducts.length,
          totalProductCount: data.products.length,
          vehicleTotal,
          storeChunk: sc + 1,
          storeTotalChunks,
          productChunk: pc + 1,
          productTotalChunks,
          dateLabel: data.dateLabel,
          orgName: data.organizationName,
        });
      }
    }
  }

  const totalPages = defs.length;
  return defs.map((d, i) => ({ ...d, globalPage: i + 1, totalPages }));
}

// ─── Page header ──────────────────────────────────────────────────────────────

function PageHeader({ p }: { p: PageDef }) {
  const { accentColor } = p;
  const isUnassigned = p.vehicleId === null;

  const chunkParts: string[] = [];
  if (p.storeTotalChunks > 1)   chunkParts.push(`ร้าน ${p.storeChunk}/${p.storeTotalChunks}`);
  if (p.productTotalChunks > 1) chunkParts.push(`สินค้า ${p.productChunk}/${p.productTotalChunks}`);

  return (
    <div style={{ borderBottom: `3px solid ${accentColor}`, paddingBottom: "1.5mm" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
          <div style={{
            background: accentColor, color: "#fff",
            fontWeight: 900, fontSize: "11pt",
            padding: "1mm 4mm", borderRadius: "4px",
          }}>
            {isUnassigned ? "ยังไม่ได้กำหนดรถ" : `🚛 ${p.vehicleName}`}
          </div>
          <span style={{ fontSize: "8pt", color: "#64748b" }}>{p.orgName}</span>
          {chunkParts.length > 0 && (
            <span style={{
              fontSize: "7pt", fontWeight: 700,
              padding: "0.5mm 2.5mm", borderRadius: "3px",
              background: "#f1f5f9", color: accentColor,
              border: `1px solid ${accentColor}`,
            }}>
              {chunkParts.join(" · ")}
            </span>
          )}
          {p.vehicleActiveProductCount < p.totalProductCount && (
            <span style={{
              fontSize: "6.5pt", color: "#64748b",
              background: "#fef9c3", padding: "0.4mm 2mm",
              borderRadius: "3px", border: "1px solid #fde047",
            }}>
              เฉพาะที่มีออเดอร์ · {p.vehicleActiveProductCount}/{p.totalProductCount} รายการ
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "6mm", alignItems: "baseline" }}>
          <span style={{ fontSize: "8pt", color: "#475569" }}>
            วันที่ <strong style={{ color: accentColor }}>{p.dateLabel}</strong>
          </span>
          <span style={{ fontSize: "8pt", color: "#475569" }}>
            {p.vehicleStoreCount} ร้าน
            {" · "}<strong style={{ color: accentColor }}>{p.vehicleTotal.toLocaleString("th-TH")}</strong> หน่วย
          </span>
          <span style={{
            fontSize: "7pt", fontWeight: 700, color: "#fff",
            background: "#475569", padding: "0.8mm 3mm", borderRadius: "3px",
          }}>
            หน้า {p.globalPage}/{p.totalPages}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Single page ──────────────────────────────────────────────────────────────

function PackingListPage({ p, data }: { p: PageDef; data: PackingListData }) {
  const { accentColor } = p;
  const colW = calcColWidth(p.pageStores.length);

  const pageRowTotals = p.pageProductIndices.map((pi) =>
    p.pageStoreIndices.reduce((sum, si) => sum + data.qty[pi][si], 0)
  );
  const pageColTotals = p.pageStoreIndices.map((si) =>
    p.pageProductIndices.reduce((sum, pi) => sum + data.qty[pi][si], 0)
  );
  const pageGrandTotal = pageColTotals.reduce((a, b) => a + b, 0);

  return (
    <div className="packing-sheet">
      <div style={{
        padding: "3mm 5mm 3mm",
        display: "flex", flexDirection: "column",
        height: "100%", boxSizing: "border-box",
      }}>
        <PageHeader p={p} />

        <table className="packing-matrix" style={{
          width: "100%", borderCollapse: "collapse",
          fontSize: "7pt", fontFamily: "'Sarabun', sans-serif", flex: 1,
        }}>
          <thead>
            <tr>
              <th style={{ width: "5mm" }} />
              <th style={{
                width: "68mm", textAlign: "left", padding: "0 2mm",
                fontSize: "6.5pt", color: "#64748b",
                verticalAlign: "bottom", paddingBottom: "1mm",
              }}>
                รายการสินค้า
              </th>
              {p.pageStores.map((store) => (
                <th key={store.id} style={{
                  width: colW, height: "26mm",
                  verticalAlign: "bottom", padding: "0", textAlign: "center",
                }}>
                  <div style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                    display: "inline-block",
                    fontSize: "6.5pt", fontWeight: 700, color: accentColor,
                    whiteSpace: "nowrap",
                    paddingBottom: "1mm", paddingLeft: "0.5mm",
                    maxHeight: "24mm", overflow: "hidden",
                  }}>
                    {store.name}
                  </div>
                </th>
              ))}
              <th style={{
                width: "13mm", verticalAlign: "bottom",
                padding: "0 1.5mm 1.5mm", textAlign: "right",
                fontSize: "6.5pt", color: "#64748b",
              }}>
                รวม
              </th>
            </tr>

            <tr style={{ background: accentColor }}>
              <th style={{ padding: "0.7mm 1mm", textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: "6pt" }}>#</th>
              <th style={{ padding: "0.7mm 2mm", textAlign: "left", color: "rgba(255,255,255,0.85)", fontSize: "6.5pt" }}>ชื่อสินค้า</th>
              {p.pageStores.map((store, idx) => (
                <th key={store.id} style={{
                  padding: "0.7mm 0.5mm", textAlign: "center",
                  color: "#fff", fontSize: "6pt", fontWeight: 600,
                }}>
                  {idx + 1 + (p.storeChunk - 1) * Math.ceil(p.vehicleStoreCount / p.storeTotalChunks)}
                </th>
              ))}
              <th style={{ padding: "0.7mm 1.5mm", textAlign: "right", color: "#fbbf24", fontSize: "6.5pt", fontWeight: 700 }}>
                รวม
              </th>
            </tr>
          </thead>

          <tbody>
            {p.pageProducts.map((product, rowIdx) => {
              const pi = p.pageProductIndices[rowIdx];
              const cells = p.pageStoreIndices.map((si) => data.qty[pi][si]);
              const rowTotal = pageRowTotals[rowIdx];
              const isEven = rowIdx % 2 === 1;
              const displayNum = p.productChunkStartIdx + rowIdx + 1;

              return (
                <tr key={product.key} style={{ background: isEven ? "#f1f5f9" : "#ffffff" }}>
                  <td style={{ padding: "0.15mm 1mm", textAlign: "center", color: "#94a3b8", fontSize: "6pt" }}>
                    {displayNum}
                  </td>
                  <td style={{ padding: "0.15mm 2mm", fontWeight: 600, color: "#0f172a", fontSize: "7pt" }}>
                    {product.name}
                    <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: "1.5mm", fontSize: "5.5pt" }}>
                      {product.unit}
                    </span>
                  </td>
                  {cells.map((qty, idx) => (
                    <td key={p.pageStores[idx].id} style={{
                      padding: "0.15mm 0.5mm", textAlign: "center",
                      fontWeight: qty > 0 ? 700 : 400,
                      color: qty > 0 ? "#0f172a" : "#d1d5db",
                      fontSize: qty > 0 ? "9pt" : "7pt",
                    }}>
                      {qty > 0 ? qty : "·"}
                    </td>
                  ))}
                  <td style={{
                    padding: "0.15mm 1.5mm", textAlign: "right",
                    fontWeight: 800, fontSize: "9pt",
                    color: rowTotal > 0 ? accentColor : "#cbd5e1",
                    background: isEven ? "#e2e8f0" : "#f1f5f9",
                  }}>
                    {rowTotal > 0 ? rowTotal : "—"}
                  </td>
                </tr>
              );
            })}

            <tr style={{ background: accentColor }}>
              <td style={{ padding: "0.8mm 1mm" }} />
              <td style={{ padding: "0.8mm 2mm", fontWeight: 800, color: "#fff", fontSize: "7pt" }}>
                รวมทั้งหมด
              </td>
              {pageColTotals.map((total, idx) => (
                <td key={p.pageStores[idx].id} style={{
                  padding: "0.8mm 0.5mm", textAlign: "center",
                  fontWeight: 800, fontSize: "9pt",
                  color: total > 0 ? "#fff" : "rgba(255,255,255,0.35)",
                }}>
                  {total > 0 ? total : "—"}
                </td>
              ))}
              <td style={{
                padding: "0.8mm 1.5mm", textAlign: "right",
                fontWeight: 900, fontSize: "9pt", color: "#fbbf24",
              }}>
                {pageGrandTotal.toLocaleString("th-TH")}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: "1mm", paddingTop: "1mm", borderTop: "1px dashed #cbd5e1",
        }}>
          <span style={{ fontSize: "6pt", color: "#94a3b8" }}>
            ร้านค้าหน้านี้: {p.pageStores[0]?.name} — {p.pageStores[p.pageStores.length - 1]?.name}
            {" "}({p.pageStores.length} ร้าน)
            {p.productTotalChunks > 1 && ` · สินค้า #${p.productChunkStartIdx + 1}–${p.productChunkStartIdx + p.pageProducts.length}`}
          </span>
          <span style={{ fontSize: "6pt", color: "#94a3b8" }}>
            ผู้จัด ______________________ วันที่จัด {p.dateLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Layout (exported) ────────────────────────────────────────────────────────

export function PackingListLayout({ data }: { data: PackingListData }) {
  const pages = buildPages(data);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800;900&display=swap');

        @page { size: 297mm 210mm; margin: 0; }

        @media print {
          html, body { width: 297mm; height: 210mm; }
          body { margin: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .no-print { display: none !important; }
          .packing-sheet { page-break-after: always; box-shadow: none !important; }
          .packing-sheet:last-child { page-break-after: avoid; }
        }

        @media screen {
          body {
            background: #e5e7eb !important;
            display: flex; flex-direction: column;
            align-items: center; padding: 32px 16px; gap: 24px;
          }
          .packing-sheet { box-shadow: 0 4px 32px rgba(0,0,0,0.15); }
        }

        .packing-sheet {
          background: white;
          width: ${SHEET_W}; height: ${SHEET_H};
          overflow: hidden;
          font-family: 'Sarabun', sans-serif;
        }

        .packing-matrix td, .packing-matrix th { border: 1px solid #1e293b; }
        .packing-matrix thead tr:first-child td,
        .packing-matrix thead tr:first-child th { border: none; }
      `}</style>

      {pages.map((p) => (
        <PackingListPage
          key={`${p.vehicleId ?? "ua"}-s${p.storeChunk}-p${p.productChunk}`}
          p={p}
          data={data}
        />
      ))}
    </>
  );
}
