'use client';

import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { RotaCalendarClient } from '@/components/rota/rota-calendar-client';

export default function RotaCalendarPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
          <RotaCalendarClient />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
