import { AppSidebar } from '@/components/app-sidebar';
import { Shimmer, SkeletonCard } from '@/components/dashboard/kit/skeleton-card';

export default function DashboardLoading() {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="h-14 shrink-0 border-b border-border bg-card" />
        <main className="dash-canvas min-h-0 flex-1 overflow-y-auto" aria-busy>
          <div className="w-full space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10">
            <div className="space-y-3">
              <Shimmer className="h-4 w-56" />
              <Shimmer className="h-9 w-80" />
              <Shimmer className="h-6 w-64" />
            </div>
            <Shimmer className="h-[5.5rem] rounded-2xl" />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <SkeletonCard key={i} rows={1} />
              ))}
            </div>
            <div className="grid gap-5 lg:grid-cols-12">
              <SkeletonCard className="min-h-[26rem] lg:col-span-8" rows={6} />
              <SkeletonCard className="min-h-[26rem] lg:col-span-4" rows={6} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
