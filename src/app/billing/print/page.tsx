import { notFound } from "next/navigation";
import { requireAppRole } from "@/lib/auth/authorization";
import { getBillingStatementData, getBatchBillingData, type BillingStatementData } from "@/lib/billing/billing-statement";
import { PrintViewer } from "./print-viewer";

export const metadata = { title: "ใบวางบิล" };

type Props = { 
  searchParams: Promise<{ 
    customer?: string; 
    from?: string; 
    to?: string; 
    batch?: string;
    save?: string;
  }> 
};

function todayISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

function isValidDate(s: string | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function BillingPrintPage({ searchParams }: Props) {
  const session = await requireAppRole("admin");
  const params = await searchParams;

  const customerId = params.customer;
  const fromDate = params.from;
  const toDate = params.to;
  const isBatch = params.batch === "true";
  const shouldSave = params.save === "true";

  if (!isValidDate(fromDate) || !isValidDate(toDate)) notFound();
  if (!isBatch && !customerId) notFound();

  const billingDate = todayISO();
  
  let data: BillingStatementData | BillingStatementData[] | null = null;
  
  // Note: We DON'T pass saveHistory: true here anymore, because we want it 
  // to be recorded ONLY when the user clicks 'Print & Save' in the PrintViewer.
  if (isBatch) {
    data = await getBatchBillingData(
      session.organizationId,
      fromDate,
      toDate,
      billingDate,
      { saveHistory: false } 
    );
  } else if (customerId) {
    data = await getBillingStatementData(
      session.organizationId,
      customerId,
      fromDate,
      toDate,
      billingDate,
      { saveHistory: false }
    );
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return (
      <>
        <style>{`
          @media print { .no-print { display: none !important; } }
          @media screen { body { background: #e5e7eb; } }
        `}</style>
        <div className="no-print flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-lg font-semibold text-slate-500">ไม่พบรายการใบส่งของในช่วงวันที่เลือก</p>
          <p className="text-sm text-slate-400">
            {fromDate} ถึง {toDate}
          </p>
          <a
            href="/billing"
            className="mt-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            กลับ
          </a>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } }
        @media screen { body { background: #e5e7eb; } }
      `}</style>

      <PrintViewer 
        initialData={data} 
        organizationId={session.organizationId}
        shouldSave={shouldSave}
        fromDate={fromDate}
        toDate={toDate}
      />
    </>
  );
}
