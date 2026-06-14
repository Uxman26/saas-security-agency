'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { OverviewCharts } from '@/components/dashboard/overview-charts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
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
  Shield,
  CalendarRange,
  CalendarCheck,
  Activity,
  BadgeCheck,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { can, PERMS } from '@/lib/permissions';
import type { DashboardOverview, ComplianceAlert, ContractExpiryAlert } from '@/lib/types';

const gbp = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);

const companyTiles = [
  { href: '/guards', title: 'Staff', desc: 'Manage staff & compliance', icon: Users, color: 'text-blue-600', perm: 'guards.read' },
  { href: '/sites', title: 'Sites', desc: 'Manage deployment sites', icon: MapPin, color: 'text-green-600', perm: 'sites.read' },
  { href: '/clients', title: 'Clients', desc: 'Manage client accounts', icon: Building2, color: 'text-purple-600', perm: 'clients.read' },
  { href: '/assignments', title: 'Assignments', desc: 'Schedule staff shifts', icon: ClipboardList, color: 'text-orange-600', perm: 'assign.read' },
  { href: '/rota', title: 'Rotas & Shifts', desc: 'Planner and assignment grid', icon: Calendar, color: 'text-cyan-600', perm: 'assign.read' },
  { href: '/attendance', title: 'Attendance', desc: 'Track staff attendance', icon: Clock, color: 'text-teal-600', perm: 'attend.read' },
  { href: '/documents', title: 'Documents', desc: 'Staff documents & expiry', icon: FolderOpen, color: 'text-amber-600', perm: 'doc.read' },
  { href: '/contractors', title: 'Contractors', desc: 'Main & sub contractor onboarding', icon: UserCog, color: 'text-indigo-600', perm: PERMS.contractorView },
  { href: '/payroll', title: 'Payroll', desc: 'Calculate & manage payroll', icon: PoundSterling, color: 'text-emerald-600', perm: 'payroll.read' },
  { href: '/invoices', title: 'Invoices', desc: 'Client billing & invoices', icon: FileText, color: 'text-rose-600', perm: 'inv.read' },
  { href: '/payments', title: 'Payments', desc: 'Track received payments', icon: CreditCard, color: 'text-violet-600', perm: 'pay.read' },
  { href: '/allowances', title: 'Allowances', desc: 'Rates & allowance config', icon: Wallet, color: 'text-sky-600', perm: 'allow.read' },
  { href: '/settings/special-days', title: 'Special days', desc: 'Bank holidays & double-rate dates', icon: CalendarRange, color: 'text-amber-600', perm: 'allow.read' },
  { href: '/settings/roles', title: 'Roles & users', desc: 'Roles, permissions, and user assignment', icon: Shield, color: 'text-primary', perm: 'roles.read' },
];

const adminTiles = [
  { href: '/admin/companies', title: 'Companies', desc: 'View and edit tenant companies', icon: Building2, color: 'text-primary' },
  { href: '/admin/users', title: 'Users', desc: 'All platform users — activate or deactivate', icon: Users, color: 'text-blue-600' },
  { href: '/admin/admins', title: 'Admins', desc: 'Tenant admin accounts & sidebar access', icon: UserCog, color: 'text-indigo-600' },
  { href: '/admin/invoices', title: 'Invoices', desc: 'All tenant invoices across the platform', icon: FileText, color: 'text-rose-600' },
  { href: '/admin/payments', title: 'Payments', desc: 'All payment records', icon: CreditCard, color: 'text-violet-600' },
  { href: '/admin/receipts', title: 'Receipts', desc: 'Subscription payments & mark paid', icon: Wallet, color: 'text-emerald-600' },
  { href: '/admin/packages', title: 'Packages', desc: 'Subscription plan pricing & limits', icon: Shield, color: 'text-amber-600' },
];

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  warn,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: LucideIcon;
  warn?: boolean;
  accent?: string;
}) {
  return (
    <div
      className={`rounded-xl border bg-card/90 p-4 shadow-sm transition-shadow hover:shadow-md ${
        warn ? 'border-amber-500/40' : 'border-border/60'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="rounded-lg bg-primary/10 p-1.5">
          <Icon className={`size-4 ${accent ?? 'text-primary'}`} />
        </div>
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${warn ? 'text-amber-600' : ''}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [contractAlerts, setContractAlerts] = useState<ContractExpiryAlert[]>([]);
  const [alertsError, setAlertsError] = useState('');

  useEffect(() => {
    if (!isSuperAdmin) {
      setAlertsError('');
      setLoading(true);
      api.reports
        .dashboard()
        .then(setOverview)
        .catch(() => setOverview(null))
        .finally(() => setLoading(false));
      void Promise.all([api.reports.compliance(30), api.reports.contractsExpiring(30)])
        .then(([a, c]) => {
          setAlerts(a);
          setContractAlerts(c);
        })
        .catch((e: Error) => setAlertsError(e.message || 'Could not load alerts'));
    }
  }, [isSuperAdmin]);

  const tiles = useMemo(() => {
    if (isSuperAdmin) return adminTiles;
    const showContractors = can(user, PERMS.contractorView);
    return companyTiles.filter((t) => {
      if (t.href === '/contractors') return showContractors;
      return can(user, t.perm);
    });
  }, [user, isSuperAdmin]);

  const stats = overview?.stats;

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_55%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--muted)/0.25))]">
          <div className="container mx-auto px-4 py-8 max-w-[1600px]">
            <div className="mb-8 rounded-2xl border border-primary/20 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-lg shadow-primary/10">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-white/10">
                  <Shield className="size-7 text-primary" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {isSuperAdmin ? 'Platform Admin' : 'Operations Command Centre'}
                  </h1>
                  <p className="text-sm text-slate-300 mt-1">
                    {isSuperAdmin
                      ? 'Full platform control — companies, users, invoices, payments, and packages'
                      : `Welcome back${user?.full_name ? `, ${user.full_name}` : ''} — live metrics for staffing, compliance, and finance.`}
                  </p>
                </div>
                {!isSuperAdmin && stats && (
                  <div className="flex flex-wrap gap-3 text-sm">
                    <Link
                      href="/rota"
                      className="rounded-full bg-cyan-500/20 px-3 py-1 ring-1 ring-cyan-400/30 hover:bg-cyan-500/30 transition-colors"
                    >
                      <span className="text-cyan-200">Active rotas</span>{' '}
                      <strong className="text-white">{stats.rotas_active ?? 0}</strong>
                      <span className="text-cyan-200/80"> / {stats.rotas_total ?? 0}</span>
                    </Link>
                    <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/10">
                      <span className="text-slate-400">Today&apos;s shifts</span>{' '}
                      <strong className="text-white">{stats.shifts_today}</strong>
                    </span>
                    <span className="rounded-full bg-emerald-500/20 px-3 py-1 ring-1 ring-emerald-400/30">
                      <span className="text-emerald-200">Present</span>{' '}
                      <strong>{stats.present_count}</strong>
                    </span>
                    <span className="rounded-full bg-red-500/20 px-3 py-1 ring-1 ring-red-400/30">
                      <span className="text-red-200">Absent</span>{' '}
                      <strong>{stats.absent_count}</strong>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {!isSuperAdmin && loading && (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                Loading dashboard…
              </div>
            )}

            {!isSuperAdmin && !loading && stats && overview && (
              <>
                <section className="mb-6">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Workforce & compliance
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                    <Kpi label="Staff" value={stats.active_guards} sub="Directory total" icon={Users} />
                    <Kpi label="Sites" value={stats.sites_count} icon={MapPin} accent="text-green-600" />
                    <Kpi label="Clients" value={stats.clients_count} icon={Building2} accent="text-purple-600" />
                    <Kpi
                      label="Docs expiring"
                      value={stats.expiring_documents}
                      sub="Within 30 days"
                      icon={FolderOpen}
                      warn={stats.expiring_documents > 0}
                    />
                    <Kpi
                      label="SIA expiring"
                      value={stats.sia_expiring_30d}
                      sub="Within 30 days"
                      icon={BadgeCheck}
                      warn={stats.sia_expiring_30d > 0}
                    />
                    <Kpi
                      label="Contracts"
                      value={stats.contracts_expiring_soon}
                      sub="Client contracts (30d)"
                      icon={CalendarCheck}
                      warn={stats.contracts_expiring_soon > 0}
                    />
                  </div>
                </section>

                <section className="mb-6">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Rotas
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Link href="/rota" className="block">
                      <Kpi
                        label="Total rotas"
                        value={stats.rotas_total ?? 0}
                        sub="All saved rotas"
                        icon={CalendarRange}
                        accent="text-cyan-600"
                      />
                    </Link>
                    <Link href="/rota?tab=active" className="block">
                      <Kpi
                        label="Active rotas"
                        value={stats.rotas_active ?? 0}
                        sub="End date today or later"
                        icon={Calendar}
                        accent="text-cyan-600"
                      />
                    </Link>
                  </div>
                </section>

                <section className="mb-6">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Shifts & attendance
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Kpi label="Shifts today" value={stats.shifts_today} icon={Calendar} accent="text-cyan-600" />
                    <Kpi label="Shifts (7 days)" value={stats.upcoming_shifts} sub="From today" icon={Activity} />
                    <Kpi
                      label="Late (30d)"
                      value={stats.late_count}
                      icon={Clock}
                      warn={stats.late_count > 0}
                      accent="text-red-600"
                    />
                    <Kpi
                      label="Present today"
                      value={stats.present_count}
                      icon={BadgeCheck}
                      accent="text-emerald-600"
                    />
                  </div>
                </section>

                <section className="mb-8">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Finance
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Kpi
                      label="Payroll (all time)"
                      value={gbp(stats.revenue_total)}
                      icon={PoundSterling}
                      accent="text-emerald-600"
                    />
                    <Kpi label="Payroll MTD" value={gbp(stats.payroll_mtd)} icon={TrendingUp} />
                    <Kpi label="Invoiced total" value={gbp(stats.invoice_total)} icon={FileText} accent="text-rose-600" />
                    <Kpi
                      label="Outstanding"
                      value={gbp(stats.invoice_outstanding)}
                      sub="Draft + sent"
                      icon={FileText}
                      warn={stats.invoice_outstanding > 0}
                    />
                  </div>
                </section>

                <div className="grid gap-6 xl:grid-cols-3 mb-8">
                  <div className="xl:col-span-2">
                    <OverviewCharts
                      shifts={overview.shifts_by_day}
                      attendance={overview.attendance_by_status}
                      payroll={overview.payroll_by_month}
                      operations={overview.operations_compare}
                    />
                  </div>
                  <div className="space-y-4">
                    <Card className="border-border/60 bg-card/90">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Contractors</CardTitle>
                        <CardDescription>Main and sub directory</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4 text-sm">
                        <div className="flex justify-between items-center rounded-lg bg-muted/40 px-3 py-2">
                          <span className="text-muted-foreground">Main</span>
                          <span>
                            <strong>{stats.main_contractors_active}</strong>
                            <span className="text-muted-foreground"> / {stats.main_contractors_total} active</span>
                          </span>
                        </div>
                        <div className="flex justify-between items-center rounded-lg bg-muted/40 px-3 py-2">
                          <span className="text-muted-foreground">Sub</span>
                          <span>
                            <strong>{stats.sub_contractors_active}</strong>
                            <span className="text-muted-foreground"> / {stats.sub_contractors_total} active</span>
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {alertsError && (
                      <Card className="border-destructive/40 bg-destructive/10">
                        <CardContent className="pt-6 text-sm text-destructive">{alertsError}</CardContent>
                      </Card>
                    )}

                    {contractAlerts.length > 0 && (
                      <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/10">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-800 dark:text-amber-400">
                            <CalendarCheck className="size-4" />
                            Contracts ({contractAlerts.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
                            {contractAlerts.slice(0, 6).map((a) => (
                              <li key={a.client_id} className="text-amber-900 dark:text-amber-300 text-xs">
                                <span className="font-medium">{a.client_name}</span> — {a.contract_end_date}
                              </li>
                            ))}
                          </ul>
                          <Link href="/clients" className="text-xs text-amber-800 dark:text-amber-400 underline mt-2 inline-block">
                            Manage clients
                          </Link>
                        </CardContent>
                      </Card>
                    )}

                    {alerts.length > 0 && (
                      <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/10">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-800 dark:text-amber-400">
                            <AlertTriangle className="size-4" />
                            Compliance ({alerts.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
                            {alerts.slice(0, 8).map((a, i) => (
                              <li key={i} className="text-xs text-amber-900 dark:text-amber-300">
                                <span className="font-medium">{a.guard_name}</span> — {a.document_type}
                              </li>
                            ))}
                          </ul>
                          <Link href="/documents" className="text-xs text-amber-800 dark:text-amber-400 underline mt-2 inline-block">
                            View documents
                          </Link>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </>
            )}

            {!isSuperAdmin && !loading && !stats && (
              <Card className="mb-8 border-destructive/30">
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  Could not load dashboard metrics. Check your connection and try refreshing.
                </CardContent>
              </Card>
            )}

            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {isSuperAdmin ? 'Admin' : 'Quick access'}
              </h2>
              <div className={`grid gap-3 ${isSuperAdmin ? 'sm:grid-cols-2 lg:grid-cols-3 max-w-3xl' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
                {tiles.map(({ href, title, desc, icon: Icon, color }) => (
                  <Link key={href} href={href}>
                    <Card className="h-full transition-all border-border/60 hover:border-primary/30 hover:shadow-md group">
                      <CardHeader className="flex flex-row items-start gap-3 py-4">
                        <div className="rounded-lg bg-primary/10 p-2 group-hover:bg-primary/15">
                          <Icon className={`size-4 ${color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm leading-tight">{title}</CardTitle>
                          <CardDescription className="text-xs mt-0.5 line-clamp-1">{desc}</CardDescription>
                        </div>
                        <ArrowRight className="size-3.5 text-muted-foreground shrink-0 group-hover:text-primary" />
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
