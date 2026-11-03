"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-500">
          Error
        </p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">
          เกิดข้อผิดพลาดระหว่างโหลดหน้า
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาอยู่ให้ติดต่อผู้ดูแลระบบ
        </p>
        <button
          onClick={() => reset()}
          className="mt-6 rounded-2xl bg-[#003366] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#002244]"
        >
          ลองใหม่
        </button>
        {error.digest ? (
          <p className="mt-4 text-xs text-slate-400">Ref: {error.digest}</p>
        ) : null}
      </div>
    </main>
  );
}
