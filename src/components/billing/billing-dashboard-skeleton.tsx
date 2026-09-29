function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} />;
}

export function BillingDashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-0 py-6 sm:px-8 sm:py-10 md:px-4">
      {/* Header Skeleton */}
      <header className="mb-8 flex flex-col justify-between gap-4 px-4 sm:flex-row sm:items-center md:px-0">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center bg-[#003366] text-white shadow-xl shadow-[#003366]/20">
            <div className="h-7 w-7 rounded bg-white/30 animate-pulse" />
          </div>
          <div className="space-y-2">
            <SkeletonBlock className="h-8 w-48 sm:w-64" />
            <SkeletonBlock className="h-4 w-56 sm:w-80" />
          </div>
        </div>
      </header>

      {/* Tabs Skeleton */}
      <div className="mb-8 flex border-b border-slate-200 md:px-0">
        <div className="flex-1 border-b-4 border-[#003366] py-4 text-center">
          <SkeletonBlock className="mx-auto h-5 w-32" />
        </div>
        <div className="flex-1 border-b-4 border-transparent py-4 text-center">
          <SkeletonBlock className="mx-auto h-5 w-32 opacity-40" />
        </div>
      </div>

      {/* Main Content Card Skeleton */}
      <div className="border-y border-slate-200 bg-white p-4 shadow-none md:border md:p-8 md:shadow-md">
        {/* Date Filter Bar */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <SkeletonBlock className="h-10 w-36" />
          <SkeletonBlock className="h-10 w-36" />
          <SkeletonBlock className="h-10 w-44" />
          <SkeletonBlock className="ml-auto h-10 w-28" />
        </div>

        {/* Candidate List Skeleton */}
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-xl border border-slate-100 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-2">
                <SkeletonBlock className="h-5 w-48" />
                <SkeletonBlock className="h-4 w-32" />
              </div>
              <div className="flex items-center gap-4">
                <SkeletonBlock className="h-6 w-24" />
                <SkeletonBlock className="h-9 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
