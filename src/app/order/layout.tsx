import { LiffProvider } from "@/components/liff-provider";

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID || "";
  return <LiffProvider liffId={liffId}>{children}</LiffProvider>;
}
