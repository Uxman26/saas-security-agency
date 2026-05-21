'use client';

import { Suspense } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { RotaCalendarClient } from '@/components/rota/rota-calendar-client';
import { Loader2 } from 'lucide-react';

function CalendarFallback() {
  return (
    <div className="container mx-auto px-4 py-16 flex items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      Loading…
    </div>
  );
}

export default function RotaCalendarPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
          <Suspense fallback={<CalendarFallback />}>
            <RotaCalendarClient />
          </Suspense>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
