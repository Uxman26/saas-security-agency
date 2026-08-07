'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppSidebar } from '@/components/app-sidebar';
import CubeLoader from '@/components/ui/cube-loader';
import { InlineDashboardSkeleton } from '@/components/skeletons';

/** Dashboard route loading: cube briefly, skip if cache already warm. */
export default function DashboardLoading() {
  const queryClient = useQueryClient();
  const cached = queryClient.getQueryData(['dashboard-overview']);
  const [phase, setPhase] = useState<'cube' | 'skeleton' | 'done'>(
    cached ? 'done' : 'cube'
  );

  useEffect(() => {
    if (cached) {
      setPhase('done');
      return;
    }
    const t = window.setTimeout(() => setPhase('skeleton'), 1000);
    return () => window.clearTimeout(t);
  }, [cached]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="h-12 shrink-0 border-b border-border bg-card" />
        <main className="min-h-0 flex-1 overflow-y-auto">
          {phase === 'cube' ? (
            <div className="flex min-h-[min(70vh,560px)] items-center justify-center">
              <CubeLoader compact label="Loading" description="Loading dashboard…" />
            </div>
          ) : (
            <div className="container mx-auto space-y-6 px-4 py-6">
              <InlineDashboardSkeleton />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
