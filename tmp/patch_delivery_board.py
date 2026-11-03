"""
Patch delivery-board.tsx:
  - Replace DeliveryCustomerSection (lines 788-1189) with new table-row-based version
  - Replace DeliveryDayTable (lines 1193-1246) with sticky-header single-table version
  - Add DeliveryTableCols helper before DeliveryDayTable
Line numbers are 1-indexed as shown by the Read tool.
"""

import pathlib

TARGET = pathlib.Path(r"C:\Users\Riew\Desktop\TYNoodle\src\components\delivery\delivery-board.tsx")

with open(TARGET, encoding="utf-8") as f:
    lines = f.readlines()

# Keep: lines 1-787 (indices 0-786) and lines 1247+ (indices 1246+)
before = lines[:787]   # up to and including the blank line before the function
after  = lines[1246:]  # from "// Main board" onward

NEW = '''\
function DeliveryCustomerSection({
  item,
  onOpenNote,
}: {
  item: DeliveryListItem;
  onOpenNote: (noteId: string) => void;
}) {
  const [isPrinting, setIsPrinting] = useState(false);

  const tone = statusTone(item);
  const printHref = `/delivery/print?date=${item.deliveryDate}&customer=${item.customerId}`;

  const noteGroups = useMemo(() => {
    const itemsByNote = new Map<string, DeliveryEditableItem[]>();
    for (const di of item.deliveryItems) {
      const bucket = itemsByNote.get(di.deliveryNoteId) ?? [];
      bucket.push(di);
      itemsByNote.set(di.deliveryNoteId, bucket);
    }
    return item.deliveryNotes.map((note) => ({
      note,
      items: itemsByNote.get(note.id) ?? [],
    }));
  }, [item]);

  const deliveryNumberLabel = item.deliveryNotes.map((note) => note.deliveryNumber).join(", ");
  const primaryNoteId = noteGroups[0]?.note.id ?? null;
  const aggregatedRows = useMemo(() => {
    const deliveredTotals = new Map<string, { lineTotal: number; quantityDelivered: number }>();
    const deliveryImageMap = new Map<string, string>();

    for (const deliveryItem of item.deliveryItems) {
      const key = `${deliveryItem.productId}::${deliveryItem.saleUnitLabel}`;
      const current = deliveredTotals.get(key) ?? { lineTotal: 0, quantityDelivered: 0 };
      current.lineTotal += deliveryItem.lineTotal;
      current.quantityDelivered += deliveryItem.quantityDelivered;
      deliveredTotals.set(key, current);
      if (deliveryItem.imageUrl && !deliveryImageMap.has(key)) {
        deliveryImageMap.set(key, deliveryItem.imageUrl);
      }
    }

    return item.lines
      .map((line) => {
        const key = `${line.productId}::${line.saleUnitLabel}`;
        const delivered = deliveredTotals.get(key) ?? {
          lineTotal: line.deliveredLineTotal,
          quantityDelivered: line.deliveredQuantity,
        };
        const basisQty =
          delivered.quantityDelivered > 0 ? delivered.quantityDelivered : line.orderedQuantity;
        const basisTotal = delivered.lineTotal > 0 ? delivered.lineTotal : line.orderedLineTotal;

        return {
          ...line,
          editableItems: item.deliveryItems
            .filter(
              (deliveryItem) =>
                deliveryItem.productId === line.productId &&
                deliveryItem.saleUnitLabel === line.saleUnitLabel,
            )
            .map((deliveryItem) => ({
              id: deliveryItem.id,
              quantityDelivered: deliveryItem.quantityDelivered,
            })),
          imageUrl: deliveryImageMap.get(key) ?? null,
          unitPrice: basisQty > 0 ? basisTotal / basisQty : 0,
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName, "th"));
  }, [item.deliveryItems, item.lines]);

  function handlePrint() {
    setIsPrinting(true);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
    iframe.src = printHref;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      win.addEventListener("afterprint", () => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        setIsPrinting(false);
      });
      setTimeout(() => win.print(), 300);
    };
  }

  return (
    <>
      {/* Store group header row */}
      <tr>
        <td colSpan={10} className="border-t-2 border-[#0a2340] bg-[#0f2f56] px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-white/80">{item.customerCode}</span>
              <span className="h-3.5 w-px bg-white/20" aria-hidden="true" />
              <span className="text-base font-bold text-white">{item.customerName}</span>
              <span className="h-3.5 w-px bg-white/20" aria-hidden="true" />
              <span className="font-mono text-sm font-bold text-white">{deliveryNumberLabel}</span>
              <span className="h-3.5 w-px bg-white/20" aria-hidden="true" />
              {item.billingRecord ? (
                <BillingBadge billingNumber={item.billingRecord.billingNumber} />
              ) : (
                <StatusBadge tone={tone} />
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {primaryNoteId && (
                <button
                  type="button"
                  onClick={() => onOpenNote(primaryNoteId)}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/20"
                >
                  <FileText className="h-3.5 w-3.5" strokeWidth={2.2} />
                  ดูรายละเอียด
                </button>
              )}
              <button
                type="button"
                onClick={handlePrint}
                disabled={isPrinting}
                className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
              >
                <Printer className="h-3.5 w-3.5" strokeWidth={2.2} />
                {isPrinting ? "กำลังโหลด..." : "พิมพ์"}
              </button>
            </div>
          </div>
        </td>
      </tr>

      {/* Product rows */}
      {aggregatedRows.map((line) => (
        <tr
          key={`${line.productId}::${line.saleUnitLabel}`}
          className={`border-t border-slate-100 transition ${
            line.shortQuantity > 0 ? "bg-rose-50/40" : "hover:bg-slate-50/40"
          }`}
        >
          <td className="border-r border-slate-200 px-4 py-2 text-left">
            <p className="font-mono text-xs text-slate-500">{line.productSku}</p>
          </td>
          <td className="border-r border-slate-200 px-4 py-2">
            <div className="flex items-center gap-3 text-left">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                {line.imageUrl ? (
                  <Image
                    src={line.imageUrl}
                    alt={line.productName}
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package2 className="h-5 w-5 text-slate-300" strokeWidth={1.8} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="font-semibold text-slate-900">{line.productName}</p>
              </div>
            </div>
          </td>
          <td className="border-r border-slate-200 px-4 py-2 text-center text-slate-600">{line.saleUnitLabel}</td>
          <td className="border-r border-slate-200 px-4 py-2 text-center tabular-nums font-semibold text-slate-700">
            {fmtQty(line.orderedQuantity)}
          </td>
          <td className="border-r border-slate-200 px-4 py-2 text-center tabular-nums font-semibold text-slate-900">
            {fmtQty(line.deliveredQuantity)}
          </td>
          <td className="border-r border-slate-200 px-4 py-2 text-center">
            {line.shortQuantity > 0 ? (
              <span className="tabular-nums font-semibold text-rose-600">
                {fmtQty(line.shortQuantity)}
              </span>
            ) : (
              <span className="text-slate-300">\u2014</span>
            )}
          </td>
          <td className="border-r border-slate-200 px-4 py-2 text-center tabular-nums text-slate-600">
            {fmtMoneyBaht(line.unitPrice)}
          </td>
          <td className="border-r border-slate-200 px-4 py-2 text-center tabular-nums font-bold text-slate-900">
            {fmtMoneyBaht(line.deliveredLineTotal)}
          </td>
          <td className="border-r border-slate-200 px-4 py-2 text-center">
            <StatusBadge tone={tone} />
          </td>
          <td className="px-4 py-2 text-center">
            <GroupQtyPopupEditor
              items={line.editableItems}
              quantityDelivered={line.deliveredQuantity}
            />
          </td>
        </tr>
      ))}

      {/* Store subtotal */}
      <tr className="border-t-2 border-slate-200 bg-slate-50">
        <td
          colSpan={7}
          className="border-r border-slate-200 px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          ยอดรวม \u2014 {item.customerName}
        </td>
        <td className="border-r border-slate-200 px-4 py-2 text-center tabular-nums text-base font-bold text-slate-900">
          {fmtMoneyBaht(item.deliveredAmount)}
        </td>
        <td className="border-r border-slate-200 px-4 py-2" />
        <td className="px-4 py-2" />
      </tr>
    </>
  );
}

// -- Day section --

function DeliveryTableCols() {
  return (
    <colgroup>
      <col style={{ width: 96 }} />
      <col />
      <col style={{ width: 60 }} />
      <col style={{ width: 80 }} />
      <col style={{ width: 80 }} />
      <col style={{ width: 60 }} />
      <col style={{ width: 108 }} />
      <col style={{ width: 108 }} />
      <col style={{ width: 72 }} />
      <col style={{ width: 72 }} />
    </colgroup>
  );
}

function DeliveryDayTable({
  date,
  items,
  summary,
}: {
  date: string;
  items: DeliveryListItem[];
  summary: DeliveryDaySummary;
}) {
  const [modalState, setModalState] = useState<{
    item: DeliveryListItem;
    noteId: string;
  } | null>(null);

  const shortAmount = Math.max(0, summary.totalOrderedAmount - summary.totalDeliveredAmount);

  const openGroup = useMemo(() => {
    if (!modalState) return null;
    const { item, noteId } = modalState;
    const itemsByNote = new Map<string, DeliveryEditableItem[]>();
    for (const di of item.deliveryItems) {
      const bucket = itemsByNote.get(di.deliveryNoteId) ?? [];
      bucket.push(di);
      itemsByNote.set(di.deliveryNoteId, bucket);
    }
    const noteGroups = item.deliveryNotes.map((note) => ({
      note,
      items: itemsByNote.get(note.id) ?? [],
    }));
    return noteGroups.find((g) => g.note.id === noteId) ?? null;
  }, [modalState]);

  return (
    <section className="space-y-3">
      {/* Day header */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-lg font-bold text-slate-950">
            <span className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">วันส่งจริง</span>
            <span className="mx-2 text-slate-300">:</span>
            <span>{fmtDateLabel(date)}</span>
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-center">
            <p className="text-xs font-semibold text-slate-500">ร้านค้า</p>
            <p className="mt-1 text-xl font-bold text-slate-900">
              {summary.count.toLocaleString("th-TH")}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-center">
            <p className="text-xs font-semibold text-slate-500">ยอดจัดส่ง</p>
            <p className="mt-1 text-xl font-bold text-slate-900">
              {fmtMoneyBaht(summary.totalDeliveredAmount)}
            </p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-center">
            <p className="text-xs font-semibold text-rose-600">ส่วนต่าง</p>
            <p className="mt-1 text-xl font-bold text-rose-800">
              {fmtMoneyBaht(shortAmount)}
            </p>
          </div>
        </div>
      </div>

      {/* Single table card with sticky column header */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Sticky header — outside the overflow-x container so sticky works with page scroll */}
        <div className="sticky top-0 z-10 overflow-hidden rounded-t-2xl border-b border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse table-fixed text-sm">
              <DeliveryTableCols />
              <thead>
                <tr className="bg-slate-100 text-xs font-semibold uppercase tracking-[0.09em]">
                  <th className="border-r border-slate-200 px-4 py-2.5 text-left text-slate-600">รหัสสินค้า</th>
                  <th className="border-r border-slate-200 px-4 py-2.5 text-center text-slate-600">สินค้า</th>
                  <th className="border-r border-slate-200 px-4 py-2.5 text-center text-slate-600">หน่วย</th>
                  <th className="border-r border-slate-200 px-4 py-2.5 text-center text-slate-600">ยอดออเดอร์</th>
                  <th className="border-r border-slate-200 px-4 py-2.5 text-center text-slate-600">ยอดส่ง</th>
                  <th className="border-r border-slate-200 px-4 py-2.5 text-center text-slate-600">ขาด</th>
                  <th className="border-r border-slate-200 px-4 py-2.5 text-center text-slate-600">ราคา/หน่วย</th>
                  <th className="border-r border-slate-200 px-4 py-2.5 text-center text-slate-600">ยอดเงิน</th>
                  <th className="border-r border-slate-200 px-4 py-2.5 text-center text-slate-600">สถานะ</th>
                  <th className="px-4 py-2.5 text-center text-slate-600">จัดการ</th>
                </tr>
              </thead>
            </table>
          </div>
        </div>

        {/* Table body */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse table-fixed text-sm">
            <DeliveryTableCols />
            <tbody>
              {items.map((item) => (
                <DeliveryCustomerSection
                  key={`${date}::${item.customerId}`}
                  item={item}
                  onOpenNote={(noteId) => setModalState({ item, noteId })}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td
                  colSpan={7}
                  className="border-r border-slate-200 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  ยอดรวมทั้งหมด
                </td>
                <td className="border-r border-slate-200 px-4 py-2 text-center text-base font-bold text-slate-900">
                  {fmtMoneyBaht(summary.totalDeliveredAmount)}
                </td>
                <td className="border-r border-slate-200 px-4 py-2" />
                <td className="px-4 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal — rendered outside the table to avoid invalid HTML nesting */}
      {modalState && openGroup && (
        <OrderDetailModal
          customerName={modalState.item.customerName}
          deliveryNumber={openGroup.note.deliveryNumber}
          deliveryDate={modalState.item.deliveryDate}
          items={openGroup.items}
          billingRecord={modalState.item.billingRecord}
          onClose={() => setModalState(null)}
        />
      )}
    </section>
  );
}

'''

result = "".join(before) + NEW + "".join(after)

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(result)

print("Done. Lines replaced: 788-1246")
print(f"New file length: {len(result.splitlines())} lines")
