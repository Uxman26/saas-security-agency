'use client';

import { Suspense } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { RotaCalendarClient } from '@/components/rota/rota-calendar-client';
import { InlineFormSkeleton } from '@/components/skeletons';

function CalendarFallback() {
  return (
    <div className="container mx-auto px-4 py-8">
      <InlineFormSkeleton />
    </div>
  );
}

export default function RotaCalendarPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-background to-muted/30">
          <Suspense fallback={<CalendarFallback />}>
            <RotaCalendarClient />
          </Suspense>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
