'use client';

import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRotaShifts } from '@/contexts/rota-shifts-context';
import { Calendar, CalendarDays, Grid3x3, Plus } from 'lucide-react';

export default function RotaHubPage() {
  const { state } = useRotaShifts();
  const hasSession = state.days.length > 0 && state.rotaName;

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
          <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Calendar className="size-7 text-primary" />
                Rotas & Shifts
              </h1>
              <p className="text-muted-foreground text-sm mt-1">Plan shifts, views, and attendance in one place.</p>
            </div>

            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg">New planner</CardTitle>
                <CardDescription>Create an in-memory rota with table, timeline, or drag-and-drop views.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button className="bg-pink-600 hover:bg-pink-700" asChild>
                  <Link href="/rota/create">
                    <Plus className="size-4 mr-1.5" />
                    Create rota
                  </Link>
                </Button>
                {hasSession ? (
                  <Button variant="secondary" asChild>
                    <Link href="/rota/calendar">Continue editing</Link>
                  </Button>
                ) : null}
                <Button variant="outline" asChild>
                  <Link href="/rota/calendar">Open calendar</Link>
                </Button>
              </CardContent>
            </Card>

            <div className="grid sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Grid3x3 className="size-4" />
                    Assignment grid
                  </CardTitle>
                  <CardDescription className="text-xs">Live assignments from your database (filters, export).</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/rota/legacy">Open legacy grid</Link>
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="size-4" />
                    Attendance report
                  </CardTitle>
                  <CardDescription className="text-xs">Summaries from the planner session.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/rota/attendance-report">Open report</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
