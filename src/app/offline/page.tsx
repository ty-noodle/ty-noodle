import Link from "next/link";

export const metadata = {
  title: "Offline",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f4f9ff_0%,#ffffff_100%)] px-6 py-16">
      <section className="w-full max-w-xl rounded-[2rem] border border-accent-100 bg-white p-8 shadow-[0_18px_60px_rgba(22,80,155,0.08)]">
        <p className="font-mono text-xs uppercase tracking-[0.35em] text-accent-600">
          Offline Mode
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-950">
          ตอนนี้อินเทอร์เน็ตหลุดอยู่
        </h1>
        <p className="mt-4 text-base leading-8 text-stone-650">
          แอปยังเปิดหน้าเบื้องต้นให้ได้ แต่ข้อมูลสดจากระบบจะกลับมาเมื่อเชื่อมต่อ
          อินเทอร์เน็ตอีกครั้ง
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-full bg-accent-600 px-5 py-3 text-sm font-semibold text-white"
        >
          กลับหน้าแรก
        </Link>
      </section>
    </main>
  );
}
