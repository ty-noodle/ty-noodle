import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-500">
          403
        </p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">
          คุณไม่มีสิทธิ์เข้าถึงหน้านี้
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          หากคิดว่านี่เป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบ
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-2xl bg-[#003366] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#002244]"
        >
          กลับหน้าแดชบอร์ด
        </Link>
      </div>
    </main>
  );
}
