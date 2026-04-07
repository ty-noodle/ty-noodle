import Link from "next/link";

export default function Unauthorized() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-500">
          401
        </p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">
          กรุณาเข้าสู่ระบบก่อนใช้งาน
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          เซสชันของคุณอาจหมดอายุ หรือคุณยังไม่ได้ยืนยันตัวตน
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-2xl bg-[#003366] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#002244]"
        >
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    </main>
  );
}
