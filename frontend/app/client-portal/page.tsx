'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import { Building2, ClipboardList, FileText, UserPlus } from 'lucide-react';

type Tab = 'request' | 'history' | 'invoices' | 'review';

export default function ClientPortalPage() {
  const { user } = useAuth();
  const canRequest = can(user, 'staff_req.write');
  const canReview = can(user, 'staff_req.review');
  const canInvoices = can(user, 'inv.read');
  const [tab, setTab] = useState<Tab>(canRequest ? 'request' : 'history');

  const tabs = [
    ...(canRequest ? [{ id: 'request' as const, label: 'Request staff' }] : []),
    { id: 'history' as const, label: 'My requests' },
    ...(canInvoices ? [{ id: 'invoices' as const, label: 'Invoices' }] : []),
    ...(canReview ? [{ id: 'review' as const, label: 'Review queue' }] : []),
  ];

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title={<span className="flex items-center gap-2"><Building2 className="size-7 text-primary" /> Client portal</span>}
            description={`Welcome${user?.full_name ? `, ${user.full_name}` : ''}. Request security staff for your sites.`}
          />

          <ModuleTabs tabs={tabs} value={tab} onChange={setTab} />

          {tab === 'request' && canRequest && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="size-5 text-primary" />
                  New staff request
                </CardTitle>
                <CardDescription>Submit a shift request with date, times, and site.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="bg-pink-600 hover:bg-pink-700" asChild>
                  <Link href="/client-portal/request-staff">Create request</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {tab === 'history' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="size-5 text-primary" />
                  Request history
                </CardTitle>
                <CardDescription>Track pending, approved, and rejected requests.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" asChild>
                  <Link href="/client-portal/request-staff?tab=history">View all requests</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {tab === 'invoices' && canInvoices && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="size-5 text-primary" />
                  Invoices
                </CardTitle>
                <CardDescription>View billing and invoices for your account.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" asChild>
                  <Link href="/invoices">Open invoices</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {tab === 'review' && canReview && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Review queue</CardTitle>
                <CardDescription>Approve or reject client staff requests.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" asChild>
                  <Link href="/requests">Open review queue</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
