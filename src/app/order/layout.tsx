import { LiffProvider } from "@/components/liff-provider";
import { OrderRuntimeMonitor } from "./order-runtime-monitor";

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID || "";
  return (
    <LiffProvider liffId={liffId}>
      <OrderRuntimeMonitor />
      {children}
    </LiffProvider>
  );
}
