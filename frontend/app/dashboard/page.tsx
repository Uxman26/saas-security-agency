'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import {
  Users,
  MapPin,
  ClipboardList,
  Calendar,
  Building2,
  UserCog,
  ArrowRight,
  PoundSterling,
  FileText,
  Wallet,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import type { DashboardStats, ComplianceAlert } from '@/lib/types';

const companyTiles = [
  { href: '/guards', title: 'Guards', desc: 'Manage security guards', icon: Users },
  { href: '/sites', title: 'Sites', desc: 'Manage sites', icon: MapPin },
  { href: '/assignments', title: 'Assignments', desc: 'Manage assignments', icon: ClipboardList },
  { href: '/rota', title: 'Rota', desc: 'View guard rota', icon: Calendar },
  { href: '/clients', title: 'Clients', desc: 'Manage clients', icon: Building2 },
  { href: '/sub-contractors', title: 'Sub-Contractors', desc: 'Manage sub-contractors', icon: UserCog },
  { href: '/payroll', title: 'Payroll', desc: 'Payroll & payslips', icon: PoundSterling },
  { href: '/invoices', title: 'Invoices', desc: 'Billing & invoices', icon: FileText },
  { href: '/allowances', title: 'Allowances', desc: 'Rates & allowances', icon: Wallet },
];

const adminTiles = [
  { href: '/admin/companies', title: 'Companies', desc: 'View all tenant companies', icon: Building2 },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) {
      api.reports.dashboard().then(setStats).catch(() => {});
      api.reports.compliance(30).then(setAlerts).catch(() => {});
    }
  }, [isSuperAdmin]);

  const tiles = isSuperAdmin ? adminTiles : companyTiles;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {isSuperAdmin ? 'Platform Admin' : 'Dashboard'}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {isSuperAdmin ? 'Manage platform and tenant companies' : 'Overview of your security operations'}
            </p>
          </div>
          {!isSuperAdmin && stats && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Active Guards</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">{stats.active_guards}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Expiring Docs (30d)</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">{stats.expiring_documents}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Revenue Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">£{stats.revenue_total.toFixed(2)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Late Arrivals</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">{stats.late_count}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Shifts (7d)</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">{stats.upcoming_shifts}</span>
                </CardContent>
              </Card>
            </div>
          )}
          {!isSuperAdmin && alerts.length > 0 && (
            <Card className="mb-8 border-amber-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-600" />
                  Compliance Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1">
                  {alerts.slice(0, 5).map((a, i) => (
                    <li key={i}>{a.guard_name} – {a.document_type} expires {a.expiry_date}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <div className={`grid gap-4 ${isSuperAdmin ? 'sm:grid-cols-1 max-w-md' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
            {tiles.map(({ href, title, desc, icon: Icon }) => (
              <Link key={href} href={href}>
                <Card className="h-full transition-all duration-200 border-border/80 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 group">
                  <CardHeader className="flex flex-row items-start gap-4">
                    <div className="rounded-lg bg-primary/10 p-2.5 text-primary group-hover:bg-primary/20 transition-colors">
                      <Icon className="size-5" />
                    </div>
                    <div className="flex-1 space-y-1 min-w-0">
                      <CardTitle className="text-lg">{title}</CardTitle>
                      <CardDescription>{desc}</CardDescription>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <span className="text-sm font-medium text-primary group-hover:underline">
                      View {title} →
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
