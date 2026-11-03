function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200/70 ${className}`} />;
}

export function DashboardLoadingShell() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-apple-ui text-slate-800">
      <header className="mx-auto mb-6 max-w-7xl px-5 pt-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <SkeletonBlock className="h-12 w-56" />
            <SkeletonBlock className="h-5 w-72" />
          </div>
          <SkeletonBlock className="hidden h-12 w-48 md:block" />
        </div>
      </header>

      <main className="mx-auto mt-4 max-w-7xl space-y-8 px-5">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <section className="order-2 flex flex-col gap-4 md:gap-6 xl:order-1 xl:col-span-8">
            <SkeletonBlock className="h-32 w-full" />
            <div className="grid grid-cols-2 gap-4 md:gap-6">
              <SkeletonBlock className="h-28 w-full" />
              <SkeletonBlock className="h-28 w-full" />
            </div>
          </section>

          <div className="order-1 grid grid-cols-2 gap-4 xl:order-2 xl:col-span-4 xl:grid-cols-1">
            <SkeletonBlock className="h-[4.25rem] w-full" />
            <SkeletonBlock className="h-[4.25rem] w-full" />
          </div>
        </div>

        <section className="-mx-2 grid grid-cols-2 gap-2.5 px-2 md:mx-0 md:grid-cols-3 md:gap-5 md:px-0 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-40 w-full" />
          ))}
        </section>

        <div className="grid grid-cols-1 gap-8">
          <SkeletonBlock className="h-72 w-full" />
          <SkeletonBlock className="h-80 w-full" />
        </div>
      </main>
    </div>
  );
}
