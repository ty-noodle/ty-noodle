export const metadata = {
  title: "Offline",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f4f9ff_0%,#ffffff_100%)] px-6 py-16">
      <section className="w-full max-w-xl rounded-[2rem] border border-accent-100 bg-white p-8 shadow-[0_18px_60px_rgba(22,80,155,0.08)]">
        <p className="font-mono text-xs uppercase tracking-[0.35em] text-accent-600">
          โหลดระบบไม่สำเร็จ
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-950">
          ยังโหลดหน้าเว็บไม่ได้
        </h1>
        <p className="mt-4 text-base leading-8 text-stone-650">
          เบราว์เซอร์โหลดหน้าเว็บไม่สำเร็จ อาจเกิดจากการเชื่อมต่อหรือข้อผิดพลาดอื่น
          กรุณาลองโหลดระบบอีกครั้ง
        </p>
        <a
          href="/login"
          className="mt-8 inline-flex rounded-full bg-accent-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-700"
        >
          ลองโหลดระบบอีกครั้ง
        </a>
      </section>
    </main>
  );
}
