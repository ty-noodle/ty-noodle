function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} />;
}

export function ReportTableSkeleton() {
  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <div className="flex-1 space-y-4 p-4 sm:p-6 md:space-y-6 md:p-8">
        {/* Header Skeleton */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-12 w-12 !rounded-2xl" />
            <div className="space-y-1.5">
              <SkeletonBlock className="h-7 w-44 md:h-8 md:w-56" />
              <SkeletonBlock className="h-4 w-32 md:w-48" />
            </div>
          </div>
          <SkeletonBlock className="h-10 w-28 !rounded-lg" />
        </div>

        {/* Filter Bar Skeleton (Desktop) */}
        <div className="hidden border border-slate-100 bg-white p-5 shadow-sm sm:rounded-sm md:block">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <SkeletonBlock className="h-3 w-16" />
              <SkeletonBlock className="h-10 w-[180px] !rounded-lg" />
            </div>
            <div className="space-y-1">
              <SkeletonBlock className="h-3 w-16" />
              <SkeletonBlock className="h-10 w-[180px] !rounded-lg" />
            </div>
            <SkeletonBlock className="h-10 w-24 !rounded-lg" />
          </div>
        </div>

        {/* Table Skeleton */}
        <div className="mx-auto w-full max-w-[210mm] overflow-hidden border border-slate-100 bg-white shadow-md md:rounded-sm">
          {/* Table Header */}
          <div className="flex h-11 items-center bg-[#003366] px-4">
            <div className="flex w-full items-center justify-between text-white/40 text-xs font-bold">
              <span className="w-12 text-center">#</span>
              <span className="w-24">วันที่</span>
              <span className="w-24">รหัสร้าน</span>
              <span className="flex-1">ชื่อร้าน</span>
              <span className="w-28 text-right">จำนวนเงิน</span>
            </div>
          </div>

          {/* Table Rows Skeleton */}
          <div className="divide-y divide-slate-100 p-2">
            {Array.from({ length: 12 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-4 py-3.5 px-2"
              >
                <SkeletonBlock className="h-4 w-6" />
                <SkeletonBlock className="h-4 w-20" />
                <SkeletonBlock className="h-4 w-20" />
                <SkeletonBlock className="h-4 flex-1 max-w-sm" />
                <SkeletonBlock className="h-4 w-24" />
              </div>
            ))}
          </div>

          {/* Table Footer Summary Skeleton */}
          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-5 w-24" />
              <SkeletonBlock className="h-6 w-32" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
