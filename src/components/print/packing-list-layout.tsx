import type { CSSProperties } from "react";

export type PackingListStore = {
  id: string;
  name: string;
  vehicleId: string | null;
  vehicleName: string | null;
};

export type PackingListProduct = {
  key: string;
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
  qty: number[][];
  vehicles: PackingListVehicle[];
};

export type PackingListLayoutMode = "standard" | "transposed";

const SHEET_W = "297mm";
const SHEET_H = "210mm";
const SCREEN_SHEET_W = "1123px";
const SCREEN_SHEET_H = "794px";
const STANDARD_PRODUCTS_PER_PAGE = 30;
const STANDARD_STORES_PER_PAGE = 25;
const TRANSPOSED_PRODUCTS_PER_PAGE = 25;
const TRANSPOSED_STORES_PER_PAGE = 37;

const VEHICLE_COLORS = ["#123c73", "#0f766e", "#9a3412", "#5b21b6", "#1d4ed8"];
const UNASSIGNED_COLOR = "#64748b";

const COLUMN_COLOR_GROUPS = [
  { header: "#c8def4", rowA: "#edf5fd", rowB: "#f7fbff" },
  { header: "#d7ebd3", rowA: "#eef8eb", rowB: "#f7fcf4" },
  { header: "#f2e6bd", rowA: "#fbf5e6", rowB: "#fefbf1" },
  { header: "#efc9cc", rowA: "#faeaeb", rowB: "#fdf2f3" },
  { header: "#dacbf0", rowA: "#f0eafb", rowB: "#f8f4fe" },
  { header: "#d0ece5", rowA: "#ebf8f5", rowB: "#f5fcfa" },
  { header: "#efdccd", rowA: "#fbf1ea", rowB: "#fdf7f2" },
  { header: "#e4e4e4", rowA: "#f5f5f5", rowB: "#fafafa" },
] as const;

type BasePageDef = {
  vehicleId: string | null;
  vehicleName: string | null;
  accentColor: string;
  vehicleStoreCount: number;
  globalPage: number;
  totalPages: number;
  storeChunk: number;
  storeTotalChunks: number;
  productChunk: number;
  productTotalChunks: number;
  dateLabel: string;
  organizationName: string;
};

type StandardPageDef = BasePageDef & {
  pageStores: PackingListStore[];
  pageStoreIndices: number[];
  vehicleStoreIndices: number[];
  pageProducts: PackingListProduct[];
  pageProductIndices: number[];
};

type TransposedPageDef = BasePageDef & {
  pageStores: PackingListStore[];
  pageStoreIndices: number[];
  vehicleStoreIndices: number[];
  pageProducts: PackingListProduct[];
  pageProductIndices: number[];
};

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

function vehicleColor(vehicleId: string | null, vehicles: PackingListVehicle[]): string {
  if (!vehicleId) return UNASSIGNED_COLOR;
  const index = vehicles.findIndex((vehicle) => vehicle.id === vehicleId);
  return VEHICLE_COLORS[index % VEHICLE_COLORS.length] ?? VEHICLE_COLORS[0];
}

function getColumnPalette(columnIndex: number) {
  return COLUMN_COLOR_GROUPS[Math.floor(columnIndex / 5) % COLUMN_COLOR_GROUPS.length] ?? COLUMN_COLOR_GROUPS[0];
}

function insertZeroWidthSpaces(text: string): string {
  if (!text) return "";
  if (typeof Intl === "undefined" || !Intl.Segmenter) {
    return text;
  }
  try {
    const segmenter = new Intl.Segmenter("th", { granularity: "word" });
    const segments = segmenter.segment(text);
    return Array.from(segments)
      .map((s) => s.segment)
      .join("\u200B");
  } catch {
    return text;
  }
}




/* Unused
function splitProductNameToLines(name: string, maxLines = 4, maxTokenLength = 7): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const rawTokens = trimmed.replace(/\s+/g, " ").split(" ").filter(Boolean);
  const tokens = rawTokens.flatMap((token) => (horizontalLength(token) > maxTokenLength ? splitLongToken(token, maxTokenLength - 1) : [token]));
  const lines: string[] = [];
  let current = "";

  for (const token of tokens) {
    const next = current ? `${current} ${token}` : token;
    if (horizontalLength(next) <= maxTokenLength) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = token;
  }

  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;

  const limited = lines.slice(0, maxLines);
  const last = limited[maxLines - 1] ?? "";
  limited[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 1))}...`;
  return limited;
}
*/

function buildVehicleGroups(data: PackingListData) {
  type Group = { vehicleId: string | null; vehicleName: string | null; storeIndices: number[] };
  const groups = new Map<string, Group>();

  for (const vehicle of data.vehicles) {
    groups.set(vehicle.id, { vehicleId: vehicle.id, vehicleName: vehicle.name, storeIndices: [] });
  }

  groups.set("__unassigned__", { vehicleId: null, vehicleName: null, storeIndices: [] });

  data.stores.forEach((store, index) => {
    const key = store.vehicleId ?? "__unassigned__";
    if (!groups.has(key)) {
      groups.set(key, { vehicleId: store.vehicleId, vehicleName: store.vehicleName, storeIndices: [] });
    }
    groups.get(key)?.storeIndices.push(index);
  });

  return Array.from(groups.values()).filter((group) => group.storeIndices.length > 0);
}

function buildStandardPages(data: PackingListData): StandardPageDef[] {
  const rawDefs: Omit<StandardPageDef, "globalPage" | "totalPages">[] = [];

  for (const group of buildVehicleGroups(data)) {
    const activeProductIndices = data.products
      .map((_, productIndex) => productIndex)
      .filter((productIndex) => group.storeIndices.some((storeIndex) => data.qty[productIndex]?.[storeIndex] > 0));

    const storeChunks = chunk(group.storeIndices, STANDARD_STORES_PER_PAGE);
    const productChunks = chunk(activeProductIndices, STANDARD_PRODUCTS_PER_PAGE);

    for (let storeChunkIndex = 0; storeChunkIndex < storeChunks.length; storeChunkIndex += 1) {
      for (let productChunkIndex = 0; productChunkIndex < productChunks.length; productChunkIndex += 1) {
        const pageStoreIndices = storeChunks[storeChunkIndex];
        const pageProductIndices = productChunks[productChunkIndex];

        rawDefs.push({
          vehicleId: group.vehicleId,
          vehicleName: group.vehicleName,
          accentColor: vehicleColor(group.vehicleId, data.vehicles),
          pageStores: pageStoreIndices.map((storeIndex) => data.stores[storeIndex]),
          pageStoreIndices,
          vehicleStoreIndices: group.storeIndices,
          pageProducts: pageProductIndices.map((productIndex) => data.products[productIndex]),
          pageProductIndices,
          vehicleStoreCount: group.storeIndices.length,
          storeChunk: storeChunkIndex + 1,
          storeTotalChunks: storeChunks.length,
          productChunk: productChunkIndex + 1,
          productTotalChunks: productChunks.length,
          dateLabel: data.dateLabel,
          organizationName: data.organizationName,
        });
      }
    }
  }

  return rawDefs.map((page, index, pages) => ({
    ...page,
    globalPage: index + 1,
    totalPages: pages.length,
  }));
}

function buildTransposedPages(data: PackingListData): TransposedPageDef[] {
  const rawDefs: Omit<TransposedPageDef, "globalPage" | "totalPages">[] = [];

  for (const group of buildVehicleGroups(data)) {
    const activeProductIndices = data.products
      .map((_, productIndex) => productIndex)
      .filter((productIndex) => group.storeIndices.some((storeIndex) => data.qty[productIndex]?.[storeIndex] > 0));

    const storeChunks = chunk(group.storeIndices, TRANSPOSED_STORES_PER_PAGE);
    const productChunks = chunk(activeProductIndices, TRANSPOSED_PRODUCTS_PER_PAGE);

    for (let storeChunkIndex = 0; storeChunkIndex < storeChunks.length; storeChunkIndex += 1) {
      for (let productChunkIndex = 0; productChunkIndex < productChunks.length; productChunkIndex += 1) {
        const pageStoreIndices = storeChunks[storeChunkIndex];
        const pageProductIndices = productChunks[productChunkIndex];

        rawDefs.push({
          vehicleId: group.vehicleId,
          vehicleName: group.vehicleName,
          accentColor: vehicleColor(group.vehicleId, data.vehicles),
          pageStores: pageStoreIndices.map((storeIndex) => data.stores[storeIndex]),
          pageStoreIndices,
          vehicleStoreIndices: group.storeIndices,
          pageProducts: pageProductIndices.map((productIndex) => data.products[productIndex]),
          pageProductIndices,
          vehicleStoreCount: group.storeIndices.length,
          storeChunk: storeChunkIndex + 1,
          storeTotalChunks: storeChunks.length,
          productChunk: productChunkIndex + 1,
          productTotalChunks: productChunks.length,
          dateLabel: data.dateLabel,
          organizationName: data.organizationName,
        });
      }
    }
  }

  return rawDefs.map((page, index, pages) => ({
    ...page,
    globalPage: index + 1,
    totalPages: pages.length,
  }));
}

function StandardPackingHeader({
  accentColor,
  organizationName,
  dateLabel,
  vehicleName,
  storeCount,
  globalPage,
  totalPages,
  productChunk,
  productTotalChunks,
}: {
  accentColor: string;
  organizationName: string;
  dateLabel: string;
  vehicleName: string | null;
  storeCount: number;
  globalPage: number;
  totalPages: number;
  productChunk: number;
  productTotalChunks: number;
}) {
  return (
    <header className="packing-header packing-header--standard" style={{ borderColor: accentColor }}>
      <div className="packing-header__summary-line">
        <span className="packing-header__org packing-header__org--inline">{organizationName}</span>
        <h1 className="packing-header__title packing-header__title--standard">ตารางเช็คออเดอร์ลูกค้า</h1>
        <span className="packing-header__date">วันที่ {dateLabel}</span>
      </div>

      <div className="packing-header__vehicle-main">{vehicleName ?? "ยังไม่ได้กำหนดรถจัดส่ง"}</div>

      <div className="packing-header__meta">
        <div className="packing-header__meta-cell">
          <span>ร้านค้า</span>
          <strong>{storeCount.toLocaleString("th-TH")}</strong>
        </div>
        <div className="packing-header__meta-cell">
          <span>หน้า</span>
          <strong>
            {globalPage}/{totalPages}
          </strong>
        </div>
        <div className="packing-header__meta-cell">
          <span>กลุ่มสินค้า</span>
          <strong>
            {productChunk}/{productTotalChunks}
          </strong>
        </div>
      </div>
    </header>
  );
}

function calcDataColWidth(count: number, availableMm: number) {
  const raw = Math.floor(availableMm / Math.max(count, 1));
  return `${Math.max(6, raw)}mm`;
}

function StandardPackingListPage({ page, data }: { page: StandardPageDef; data: PackingListData }) {
  const columnWidth = calcDataColWidth(Math.max(page.pageProducts.length, 1), 247);
  const isLastStorePage = page.storeChunk === page.storeTotalChunks;
  const rowCount = page.pageStores.length + (isLastStorePage ? 1 : 0);
  const rowHeightMm = Math.max(6.35, Math.min(7.35, 181.5 / Math.max(rowCount, 1)));
  const productTotals = isLastStorePage
    ? page.pageProductIndices.map((productIndex) =>
        page.vehicleStoreIndices.reduce((sum, storeIndex) => sum + (data.qty[productIndex]?.[storeIndex] ?? 0), 0),
      )
    : [];

  return (
    <section className="packing-sheet">
      <div className="packing-sheet__inner">
        <StandardPackingHeader
          accentColor={page.accentColor}
          organizationName={page.organizationName}
          dateLabel={page.dateLabel}
          vehicleName={page.vehicleName}
          storeCount={page.vehicleStoreCount}
          globalPage={page.globalPage}
          totalPages={page.totalPages}
          productChunk={page.productChunk}
          productTotalChunks={page.productTotalChunks}
        />

        <div className="packing-table-wrap">
          <table className="packing-table" style={{ "--standard-row-height": `${rowHeightMm}mm` } as CSSProperties}>
            <thead>
              <tr>
                <th className="packing-col packing-col--store">ข้อมูลลูกค้า / ร้านค้า</th>
                {(() => {
                  return page.pageProducts.map((product, columnIndex) => {
                    const palette = getColumnPalette(columnIndex);
                    return (
                      <th
                        key={product.key}
                        className="packing-col packing-col--product"
                        style={{ width: columnWidth, backgroundColor: palette.header }}
                      >
                                                <div className="packing-product-header">
                          <div className="packing-product-header__name">
                            {insertZeroWidthSpaces(product.name)}
                          </div>
                          <span className="packing-product-header__unit">{product.unit}</span>
                        </div>
                      </th>
                    );
                  });
                })()}
              </tr>
            </thead>

            <tbody>
              {page.pageStores.map((store, rowIndex) => {
                const storeIndex = page.pageStoreIndices[rowIndex];

                return (
                  <tr key={store.id} className="packing-table__row">
                    <td className="packing-cell packing-cell--store">{store.name}</td>
                    {page.pageProductIndices.map((productIndex, cellIndex) => {
                      const value = data.qty[productIndex]?.[storeIndex] ?? 0;
                      const palette = getColumnPalette(cellIndex);
                      return (
                        <td
                          key={`${store.id}-${productIndex}`}
                          className={value > 0 ? "packing-cell packing-cell--qty" : "packing-cell packing-cell--empty"}
                          style={{ backgroundColor: rowIndex % 2 === 0 ? palette.rowA : palette.rowB }}
                        >
                          {value > 0 ? value.toLocaleString("th-TH") : ""}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {isLastStorePage && (
                <tr className="packing-table__total-row">
                  <td className="packing-cell packing-cell--total-label">รวมยอด</td>
                  {productTotals.map((total, index) => (
                    <td key={`standard-total-${index}`} className="packing-cell packing-cell--total">
                      {total > 0 ? total.toLocaleString("th-TH") : ""}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </section>
  );
}

function TransposedPackingListPage({ page, data }: { page: TransposedPageDef; data: PackingListData }) {
  const storeColumnWidth = calcDataColWidth(Math.max(page.pageStores.length, 1), 248);
  const productTotals = page.pageProductIndices.map((productIndex) =>
    page.pageStoreIndices.reduce((sum, storeIndex) => sum + (data.qty[productIndex]?.[storeIndex] ?? 0), 0),
  );
  const transposedRowHeightMm = Math.max(6.35, Math.min(7.35, 181.5 / Math.max(page.pageProducts.length, 1)));

  return (
    <section className="packing-sheet">
      <div className="packing-sheet__inner">
        <StandardPackingHeader
          accentColor={page.accentColor}
          organizationName={page.organizationName}
          dateLabel={page.dateLabel}
          vehicleName={page.vehicleName}
          storeCount={page.vehicleStoreCount}
          globalPage={page.globalPage}
          totalPages={page.totalPages}
          productChunk={page.productChunk}
          productTotalChunks={page.productTotalChunks}
        />

        <div className="packing-table-wrap">
          <table
            className="packing-table packing-table--transposed"
            style={{ "--transposed-row-height": `${transposedRowHeightMm}mm` } as CSSProperties}
          >
            <thead>
              <tr>
                <th className="packing-col packing-col--transpose-product">สินค้า / หน่วย</th>
                {page.pageStores.map((store, columnIndex) => {
                  const palette = getColumnPalette(columnIndex);
                  return (
                    <th
                      key={store.id}
                      className="packing-col packing-col--transpose-store"
                      style={{ width: storeColumnWidth, backgroundColor: palette.header }}
                    >
                      <div className="packing-transpose-header">
                        <span className="packing-transpose-header__name">
                          {insertZeroWidthSpaces(store.name)}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th className="packing-col packing-col--transpose-total">รวมยอด</th>
              </tr>
            </thead>

            <tbody>
              {page.pageProducts.map((product, rowIndex) => (
                <tr key={product.key} className="packing-table__row">
                  <td className="packing-cell packing-cell--transpose-product">
                    <div className="packing-transpose-product">
                      <span className="packing-transpose-product__name">{product.name}</span>
                      <span className="packing-transpose-product__unit">{product.unit}</span>
                    </div>
                  </td>
                  {page.pageStoreIndices.map((storeIndex, cellIndex) => {
                    const value = data.qty[page.pageProductIndices[rowIndex]]?.[storeIndex] ?? 0;
                    const palette = getColumnPalette(cellIndex);
                    return (
                      <td
                        key={`${product.key}-${storeIndex}`}
                        className={value > 0 ? "packing-cell packing-cell--qty" : "packing-cell packing-cell--empty"}
                        style={{ backgroundColor: rowIndex % 2 === 0 ? palette.rowA : palette.rowB }}
                      >
                        {value > 0 ? value.toLocaleString("th-TH") : ""}
                      </td>
                    );
                  })}
                  <td className="packing-cell packing-cell--transpose-total-value">
                    {productTotals[rowIndex] > 0 ? productTotals[rowIndex].toLocaleString("th-TH") : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function PackingListStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700;800&display=swap');

      @page { size: A4 landscape; margin: 0; }

      @media print {
        html, body {
          width: 297mm !important;
          height: 210mm !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          background: #ffffff !important;
        }

        body {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        main,
        div[class*="pull-to-refresh"],
        div[class*="RootAppLayoutShell"] {
          width: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          display: block !important;
          background: transparent !important;
          box-shadow: none !important;
        }

        .no-print {
          display: none !important;
        }

        .packing-print-container {
          display: block !important;
          margin: 0 !important;
          padding: 0 !important;
          line-height: 1 !important;
        }

        .packing-sheet-shell {
          width: 297mm !important;
          height: 210mm !important;
          margin: 0 !important;
          padding: 0 !important;
          display: block !important;
          overflow: hidden !important;
          line-height: 1 !important;
        }

        .packing-sheet {
          width: 297mm !important;
          height: 210mm !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;
          transform: none !important;
          transform-origin: top left !important;
          page-break-after: always;
          break-after: page;
        }

        .packing-sheet__inner {
          padding-top: 0.6mm !important;
          padding-right: 3mm !important;
          padding-bottom: 2.2mm !important;
          padding-left: 3mm !important;
          gap: 0.55mm !important;
        }

        .packing-sheet:last-child {
          page-break-after: auto;
          break-after: auto;
        }
      }

      @media screen {
        body {
          background: #e2e8f0 !important;
        }

        .packing-print-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          padding: 78px 12px 36px;
          overflow-x: hidden;
        }

        .packing-sheet-shell {
          width: ${SCREEN_SHEET_W};
          height: ${SCREEN_SHEET_H};
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }

        .packing-sheet {
          width: ${SCREEN_SHEET_W};
          height: ${SCREEN_SHEET_H};
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.16);
        }
      }

      @media screen and (max-width: 767px) {
        .packing-print-container {
          gap: 10px;
          width: 100vw;
          padding: 116px 0 20px;
        }

        .packing-sheet-shell {
          --packing-mobile-available: calc(100vw - 8px);
          --packing-mobile-scale: min(1, calc(var(--packing-mobile-available) / 1123px));
          width: var(--packing-mobile-available);
          height: calc(794px * var(--packing-mobile-scale));
          max-width: 100vw;
          overflow: hidden;
        }

        .packing-sheet {
          width: 1123px !important;
          height: 794px !important;
          max-width: none !important;
          flex: none;
          transform: scale(var(--packing-mobile-scale));
          transform-origin: top center;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
        }
      }

      .packing-sheet {
        width: ${SHEET_W};
        height: ${SHEET_H};
        overflow: hidden;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        font-family: "Sarabun", sans-serif;
        color: #0f172a;
        box-sizing: border-box;
      }

      .packing-sheet__inner {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 1.2mm 3.2mm 2.4mm;
        gap: 1.2mm;
        box-sizing: border-box;
      }

      .packing-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6mm;
        padding-bottom: 1.2mm;
        border-bottom: 1.3px solid #123c73;
      }

      .packing-header__title-block {
        display: flex;
        flex-direction: column;
        gap: 0.5mm;
        min-width: 0;
        flex: 1;
      }

      .packing-header--standard {
        display: grid;
        grid-template-columns: minmax(72mm, auto) minmax(0, 1fr) auto;
        align-items: end;
        gap: 1.8mm;
        padding-bottom: 0.35mm;
      }

      .packing-header__summary-line {
        display: flex;
        align-items: baseline;
        gap: 1.2mm;
        min-width: 0;
        white-space: nowrap;
      }

      .packing-header__org {
        font-size: 7.2pt;
        font-weight: 800;
        line-height: 1;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #123c73;
        white-space: nowrap;
      }

      .packing-header__org--inline {
        font-size: 6.7pt;
      }

      .packing-header__title {
        margin: 0;
        font-size: 12.8pt;
        line-height: 1;
        font-weight: 800;
        color: #0f172a;
        white-space: nowrap;
      }

      .packing-header__title--standard {
        font-size: 9.3pt;
      }

      .packing-header__date {
        font-size: 6.8pt;
        font-weight: 700;
        line-height: 1;
        color: #475569;
        white-space: nowrap;
      }

      .packing-header__vehicle-main {
        min-width: 0;
        text-align: center;
        font-size: 13.8pt;
        font-weight: 800;
        line-height: 1;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .packing-header__subtitle {
        display: flex;
        gap: 5mm;
        align-items: center;
        font-size: 7.5pt;
        font-weight: 700;
        line-height: 1;
        color: #475569;
        white-space: nowrap;
      }

      .packing-header__meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(19mm, auto));
        gap: 1px;
        border: 1px solid #cbd5e1;
        background: #cbd5e1;
        flex-shrink: 0;
      }

      .packing-header__meta-cell {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1.2mm;
        min-height: 4.8mm;
        padding: 0.35mm 1mm;
        background: #ffffff;
        white-space: nowrap;
      }

      .packing-table:not(.packing-table--transposed) .packing-table__row {
        height: var(--standard-row-height);
      }

      .packing-table:not(.packing-table--transposed) .packing-table__total-row {
        height: var(--standard-row-height);
      }

            .packing-table:not(.packing-table--transposed) .packing-cell--store {
        font-size: 9.8pt;
        line-height: 0.98;
      }

      .packing-table:not(.packing-table--transposed) .packing-cell--qty,
      .packing-table:not(.packing-table--transposed) .packing-cell--total {
        font-size: 9.2pt;
      }

      .packing-header__meta-cell span {
        font-size: 6.3pt;
        font-weight: 700;
        color: #64748b;
      }

      .packing-header__meta-cell strong {
        font-size: 7.9pt;
        font-weight: 800;
        color: #0f172a;
      }

      .packing-table-wrap {
        flex: 1;
        min-height: 0;
        border: 1.35px solid #111827;
        display: flex;
        align-items: flex-start;
        overflow: hidden;
      }

      .packing-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      .packing-col,
      .packing-cell {
        border-right: 1px solid #111827;
        border-bottom: 1px solid #111827;
        box-sizing: border-box;
      }

      .packing-col:last-child,
      .packing-cell:last-child {
        border-right: none;
      }

      .packing-col {
        padding: 0;
        text-align: center;
        vertical-align: middle;
      }

      .packing-col--store {
        width: 38mm;
        min-width: 38mm;
        padding: 1.2mm 1.5mm;
        background: #ffffff;
        color: #0f172a;
        font-size: 8.2pt;
        font-weight: 800;
        text-align: left;
        white-space: nowrap;
      }

      .packing-col--transpose-product {
        width: 27mm;
        min-width: 27mm;
        padding: 1.2mm 0.7mm;
        background: #ffffff;
        color: #0f172a;
        font-size: 7.2pt;
        font-weight: 800;
        text-align: left;
        white-space: nowrap;
      }

      .packing-col--transpose-total {
        width: 8mm;
        min-width: 8mm;
        padding: 1.2mm 0.2mm;
        background: #ffd400;
        color: #0f172a;
        font-size: 6.7pt;
        font-weight: 800;
        text-align: center;
        white-space: nowrap;
      }

      .packing-product-header {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 0.2mm;
        min-height: 14mm;
        padding: 0.55mm 0.05mm;
        width: 100%;
        min-width: 0;
        overflow: hidden;
      }

                        .packing-product-header__name {
        display: block;
        flex: 1;
        font-size: 7pt;
        line-height: 1.2;
        font-weight: 700;
        color: #0f172a;
        width: 100%;
        min-width: 0;
        overflow: hidden;
        white-space: normal;
        word-break: normal;
        overflow-wrap: break-word;
        text-align: left;
        padding-left: 0.8mm;
        padding-right: 0.8mm;
        padding-top: 0.5mm;
        box-sizing: border-box;
      }

      .packing-product-header__unit {
        font-size: 6pt;
        font-weight: 700;
        line-height: 1;
        color: #475569;
        text-align: left;
        padding-left: 0.8mm;
        width: 100%;
        box-sizing: border-box;
      }

      .packing-transpose-header {
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        min-height: 14mm;
        padding: 0.55mm 0.05mm;
        width: 100%;
        min-width: 0;
        overflow: hidden;
        box-sizing: border-box;
      }

      .packing-transpose-header__name {
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        flex: 1;
        font-size: 7.2pt;
        line-height: 1.2;
        font-weight: 800;
        color: #0f172a;
        width: 100%;
        min-width: 0;
        overflow: hidden;
        white-space: normal;
        word-break: normal;
        overflow-wrap: break-word;
        text-align: left;
        padding-left: 0.8mm;
        padding-right: 0.8mm;
        padding-top: 0.5mm;
        box-sizing: border-box;
      }

      .packing-table--transposed .packing-table__row {
        height: var(--transposed-row-height);
      }

      .packing-table--transposed .packing-cell--qty,
      .packing-table--transposed .packing-cell--empty {
        font-size: 9.2pt;
      }

      .packing-cell {
        padding: 0;
        text-align: center;
        vertical-align: middle;
      }

      .packing-cell--store {
        padding: 0 1.6mm;
        text-align: left;
        font-size: 8.8pt;
        font-weight: 700;
        line-height: 1.05;
        color: #0f172a;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .packing-cell--transpose-product {
        padding: 0 0.45mm;
        text-align: left;
        background: #ffffff;
      }

      .packing-transpose-product {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.35mm;
      }

      .packing-transpose-product__name {
        display: -webkit-box;
        overflow: hidden;
        font-size: 8.4pt;
        font-weight: 700;
        line-height: 1;
        color: #0f172a;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .packing-transpose-product__unit {
        flex-shrink: 0;
        font-size: 6.2pt;
        font-weight: 700;
        color: #475569;
        white-space: nowrap;
        text-align: right;
      }

      .packing-cell--qty,
      .packing-cell--total {
        font-size: 10.4pt;
        font-weight: 800;
        color: #0f172a;
      }

      .packing-table:not(.packing-table--transposed) .packing-cell--qty {
        font-size: 11.8pt;
        font-weight: 900;
        line-height: 1;
      }

      .packing-cell--transpose-total-value {
        background: #ffd400;
        font-size: 8.9pt;
        font-weight: 800;
        color: #0f172a;
      }

      .packing-cell--empty {
        font-size: 7pt;
        font-weight: 600;
        color: transparent;
      }

      .packing-table__total-row .packing-cell {
        border-top: 1.2px solid #111827;
      }

      .packing-table--transposed .packing-table__total-row {
        display: none;
      }

      .packing-cell--total-label {
        padding: 0 1.6mm;
        text-align: left;
        font-size: 7.9pt;
        font-weight: 800;
        color: #111827;
        background: #ffd400;
      }

      .packing-cell--total {
        background: #ffd400;
      }
    `}</style>
  );
}

export function PackingListLayout({
  data,
  layout = "standard",
}: {
  data: PackingListData;
  layout?: PackingListLayoutMode;
}) {
  const pages = layout === "transposed" ? buildTransposedPages(data) : buildStandardPages(data);

  return (
    <>
      <PackingListStyles />
      {pages.map((page) => (
        <div
          key={`${layout}-${page.vehicleId ?? "unassigned"}-stores-${page.storeChunk}-products-${page.productChunk}`}
          className="packing-sheet-shell"
        >
          {layout === "transposed" ? (
            <TransposedPackingListPage page={page} data={data} />
          ) : (
            <StandardPackingListPage page={page} data={data} />
          )}
        </div>
      ))}
    </>
  );
}
