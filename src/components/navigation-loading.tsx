export function NavigationLoading({ compact = false }: { compact?: boolean }) {
  return (
    <div role="status" aria-live="polite" className={compact ? "w-full py-3" : "mx-auto w-full max-w-7xl px-4 py-8 sm:px-6"}>
      <span className="sr-only">กำลังโหลดข้อมูล</span>
      <div aria-hidden="true" className="animate-pulse space-y-4 motion-reduce:animate-none">
        {!compact && <div className="h-7 w-48 rounded-lg bg-slate-200" />}
        <div className={`${compact ? "h-14" : "h-28"} rounded-2xl bg-slate-100`} />
        {!compact && <div className="h-48 rounded-2xl bg-slate-100" />}
      </div>
    </div>
  );
}
