import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireAppRole } from "@/lib/auth/authorization";
import {
  getBatchBillingData,
  getBillingStatementData,
  type BillingStatementData,
} from "@/lib/billing/billing-statement";
import { PrintViewer } from "./print-viewer";

export const metadata = { title: "ใบวางบิล" };

type Props = {
  searchParams: Promise<{
    customer?: string;
    customers?: string;
    deliveries?: string;
    from?: string;
    to?: string;
    batch?: string;
    save?: string;
    autoprint?: string;
  }>;
};

function todayISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

function isValidDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseCustomerIds(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDeliveryNumbers(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function BillingPrintPageContent({ searchParams }: Props) {
  const session = await requireAppRole("admin");
  const params = await searchParams;

  const customerId = params.customer;
  const customerIds = parseCustomerIds(params.customers);
  const deliveryNumbers = parseDeliveryNumbers(params.deliveries);
  const fromDate = params.from;
  const toDate = params.to;
  const isBatch = params.batch === "true" || customerIds.length > 0;
  const shouldSave = params.save === "true";

  if (!isValidDate(fromDate) || !isValidDate(toDate)) notFound();
  if (!isBatch && !customerId) notFound();

  const billingDate = todayISO();

  let data: BillingStatementData | BillingStatementData[] | null = null;

  if (customerIds.length > 0) {
    data = await getBatchBillingData(
      session.organizationId,
      fromDate,
      toDate,
      billingDate,
      customerIds,
      deliveryNumbers,
    );
  } else if (isBatch) {
    data = await getBatchBillingData(
      session.organizationId,
      fromDate,
      toDate,
      billingDate,
      undefined,
      deliveryNumbers,
    );
  } else if (customerId) {
    data = await getBillingStatementData(
      session.organizationId,
      customerId,
      fromDate,
      toDate,
      billingDate,
      deliveryNumbers,
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
          <p className="text-lg font-semibold text-slate-500">ไม่พบรายการใบจัดส่งในช่วงวันที่เลือก</p>
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

  const autoprint = params.autoprint === "1";

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
        autoprint={autoprint}
      />
    </>
  );
}

export default function BillingPrintPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <BillingPrintPageContent {...props} />
    </Suspense>
  );
}
