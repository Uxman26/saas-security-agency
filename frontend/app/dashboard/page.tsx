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
  Clock,
  FolderOpen,
  CreditCard,
  TrendingUp,
  Shield,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import type { DashboardStats, ComplianceAlert } from '@/lib/types';

const companyTiles = [
  { href: '/guards', title: 'Guards', desc: 'Manage security guards & compliance', icon: Users, color: 'text-blue-600' },
  { href: '/sites', title: 'Sites', desc: 'Manage deployment sites', icon: MapPin, color: 'text-green-600' },
  { href: '/clients', title: 'Clients', desc: 'Manage client accounts', icon: Building2, color: 'text-purple-600' },
  { href: '/assignments', title: 'Assignments', desc: 'Schedule guard shifts', icon: ClipboardList, color: 'text-orange-600' },
  { href: '/rota', title: 'Rota', desc: 'View the guard rota', icon: Calendar, color: 'text-cyan-600' },
  { href: '/attendance', title: 'Attendance', desc: 'Track guard attendance', icon: Clock, color: 'text-teal-600' },
  { href: '/documents', title: 'Documents', desc: 'Guard documents & expiry', icon: FolderOpen, color: 'text-amber-600' },
  { href: '/sub-contractors', title: 'Sub-Contractors', desc: 'Manage sub-contractors', icon: UserCog, color: 'text-indigo-600' },
  { href: '/payroll', title: 'Payroll', desc: 'Calculate & manage payroll', icon: PoundSterling, color: 'text-emerald-600' },
  { href: '/invoices', title: 'Invoices', desc: 'Client billing & invoices', icon: FileText, color: 'text-rose-600' },
  { href: '/payments', title: 'Payments', desc: 'Track received payments', icon: CreditCard, color: 'text-violet-600' },
  { href: '/allowances', title: 'Allowances', desc: 'Rates & allowance config', icon: Wallet, color: 'text-sky-600' },
];

const adminTiles = [
  { href: '/admin/companies', title: 'Companies', desc: 'View all tenant companies', icon: Building2, color: 'text-primary' },
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
            <div className="flex items-center gap-3 mb-1">
              <Shield className="size-8 text-primary" />
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {isSuperAdmin ? 'Platform Admin' : 'Dashboard'}
              </h1>
            </div>
            <p className="text-muted-foreground ml-11">
              {isSuperAdmin
                ? 'Manage platform and tenant companies'
                : `Welcome back${user?.full_name ? `, ${user.full_name}` : ''}. Here's your security operations overview.`}
            </p>
          </div>

          {/* Stats row */}
          {!isSuperAdmin && stats && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="size-4" /> Active Guards
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-3xl font-bold">{stats.active_guards}</span>
                </CardContent>
              </Card>
              <Card className={`border-border/60 ${stats.expiring_documents > 0 ? 'border-amber-500/50' : ''}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <FolderOpen className="size-4" /> Expiring Docs (30d)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className={`text-3xl font-bold ${stats.expiring_documents > 0 ? 'text-amber-600' : ''}`}>
                    {stats.expiring_documents}
                  </span>
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="size-4" /> Revenue Total
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-3xl font-bold text-green-600">£{stats.revenue_total.toFixed(0)}</span>
                </CardContent>
              </Card>
              <Card className={`border-border/60 ${stats.late_count > 0 ? 'border-red-500/50' : ''}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="size-4" /> Late Arrivals
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className={`text-3xl font-bold ${stats.late_count > 0 ? 'text-red-600' : ''}`}>
                    {stats.late_count}
                  </span>
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Calendar className="size-4" /> Shifts (7d)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-3xl font-bold">{stats.upcoming_shifts}</span>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Compliance alerts */}
          {!isSuperAdmin && alerts.length > 0 && (
            <Card className="mb-8 border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-800 dark:text-amber-400">
                  <AlertTriangle className="size-4" />
                  Compliance Alerts — {alerts.length} document{alerts.length !== 1 ? 's' : ''} expiring within 30 days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1">
                  {alerts.slice(0, 6).map((a, i) => (
                    <li key={i} className="flex items-center gap-2 text-amber-900 dark:text-amber-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      <span className="font-medium">{a.guard_name}</span>
                      <span className="text-amber-700 dark:text-amber-400">—</span>
                      <span>{a.document_type}</span>
                      <span className="text-amber-600 dark:text-amber-500 text-xs">expires {a.expiry_date}</span>
                    </li>
                  ))}
                  {alerts.length > 6 && (
                    <li className="text-amber-700 dark:text-amber-400 text-xs pl-3">
                      + {alerts.length - 6} more — <Link href="/documents" className="underline hover:no-underline">view all in Documents</Link>
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Navigation tiles */}
          <div className={`grid gap-4 ${isSuperAdmin ? 'sm:grid-cols-1 max-w-md' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
            {tiles.map(({ href, title, desc, icon: Icon, color }) => (
              <Link key={href} href={href}>
                <Card className="h-full transition-all duration-200 border-border/60 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 group cursor-pointer">
                  <CardHeader className="flex flex-row items-start gap-3 pb-2">
                    <div className={`rounded-lg bg-primary/10 p-2 group-hover:bg-primary/15 transition-colors`}>
                      <Icon className={`size-5 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base leading-tight">{title}</CardTitle>
                      <CardDescription className="text-xs mt-0.5 line-clamp-2">{desc}</CardDescription>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
