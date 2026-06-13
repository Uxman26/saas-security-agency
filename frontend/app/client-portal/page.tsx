'use client';

import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import { Building2, ClipboardList, FileText, UserPlus } from 'lucide-react';

export default function ClientPortalPage() {
  const { user } = useAuth();
  const canRequest = can(user, 'staff_req.write');
  const canReview = can(user, 'staff_req.review');

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="size-7 text-primary" />
              Client portal
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome{user?.full_name ? `, ${user.full_name}` : ''}. Request security staff for your sites.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {canRequest && (
              <Card className="hover:border-primary/40 transition-colors">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserPlus className="size-5 text-primary" />
                    Request staff
                  </CardTitle>
                  <CardDescription>Submit a shift request with date, times, and site.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="bg-pink-600 hover:bg-pink-700 w-full" asChild>
                    <Link href="/client-portal/request-staff">New request</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
            <Card className="hover:border-primary/40 transition-colors">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="size-5 text-primary" />
                  My requests
                </CardTitle>
                <CardDescription>Track pending, approved, and rejected requests.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/client-portal/request-staff?tab=history">View history</Link>
                </Button>
              </CardContent>
            </Card>
            {can(user, 'inv.read') && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="size-5 text-primary" />
                    Invoices
                  </CardTitle>
                  <CardDescription>View billing and invoices.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/invoices">Open invoices</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
            {canReview && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Review queue</CardTitle>
                  <CardDescription>Approve or reject client staff requests.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/requests">Open review queue</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
