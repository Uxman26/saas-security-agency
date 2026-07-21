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
import { cn } from '@/lib/utils';
import type { DashboardOverview, ComplianceAlert, ContractExpiryAlert, AdminDashboard } from '@/lib/types';

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
  { href: '/reports', title: 'Reports', desc: 'Staff, financial & usage reports', icon: ClipboardList, color: 'text-indigo-600', perm: 'rep.read' },
  { href: '/invoices', title: 'Invoices', desc: 'Client billing & invoices', icon: FileText, color: 'text-rose-600', perm: 'inv.read' },
  { href: '/payments', title: 'Payments', desc: 'Track received payments', icon: CreditCard, color: 'text-violet-600', perm: 'pay.read' },
  { href: '/allowances', title: 'Allowances', desc: 'Rates & allowance config', icon: Wallet, color: 'text-sky-600', perm: 'allow.read' },
  { href: '/settings/special-days', title: 'Special days', desc: 'Bank holidays & double-rate dates', icon: CalendarRange, color: 'text-amber-600', perm: 'allow.read' },
  { href: '/settings/roles', title: 'Roles & users', desc: 'Roles, permissions, and user assignment', icon: Shield, color: 'text-primary', perm: 'roles.read' },
];

const adminTiles = [
  { href: '/dashboard', title: 'Dashboard', desc: 'Platform overview & billing stats', icon: Shield, color: 'text-primary' },
  { href: '/admin/companies', title: 'Companies', desc: 'Tenants, modules & user limits', icon: Building2, color: 'text-primary' },
  { href: '/admin/users', title: 'Users', desc: 'All platform users — activate or deactivate', icon: Users, color: 'text-blue-600' },
  { href: '/admin/admins', title: 'Admins', desc: 'Tenant admin accounts & module access', icon: UserCog, color: 'text-indigo-600' },
  { href: '/admin/invoices', title: 'Subscription invoices', desc: 'Auto-generated platform billing', icon: FileText, color: 'text-rose-600' },
  { href: '/admin/payments', title: 'Payments', desc: 'Subscription payment records', icon: CreditCard, color: 'text-violet-600' },
  { href: '/admin/receipts', title: 'Receipts', desc: 'Signup payments & mark paid', icon: Wallet, color: 'text-emerald-600' },
  { href: '/admin/packages', title: 'Packages', desc: 'Plan pricing, limits & SMS/email features', icon: Shield, color: 'text-amber-600' },
  { href: '/admin/email', title: 'SMTP email', desc: 'Platform mail server for system emails', icon: Shield, color: 'text-blue-600' },
  { href: '/admin/logs', title: 'Activity logs', desc: 'Login history & audit trail', icon: Activity, color: 'text-cyan-600' },
];

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  warn,
  accent,
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: LucideIcon;
  warn?: boolean;
  accent?: string;
  href?: string;
}) {
  const clickable = Boolean(href);

  const card = (
    <div
      className={cn(
        'relative flex h-full min-h-[7.5rem] flex-col rounded-xl border bg-card/95 p-4 shadow-sm transition-all duration-200',
        clickable && [
          'group cursor-pointer',
          'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md hover:bg-card',
        ],
        !clickable && 'border-border/60',
        clickable && !warn && 'border-border/70',
        warn && 'border-amber-500/45 dark:border-amber-500/35'
      )}
    >
      <div className="flex items-start justify-between gap-2 pe-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </p>
        <div
          className={cn(
            'rounded-lg p-1.5',
            warn ? 'bg-amber-500/15 dark:bg-amber-500/20' : 'bg-muted/80 dark:bg-primary/15'
          )}
        >
          <Icon className={cn('size-4', accent ?? 'text-primary dark:text-orange-400')} />
        </div>
      </div>
      <p className={cn('mt-3 text-2xl font-bold tracking-tight tabular-nums', warn && 'text-amber-700 dark:text-amber-400')}>
        {value}
      </p>
      {sub ? (
        <p className="mt-auto pt-2 text-xs font-medium leading-snug text-muted-foreground line-clamp-2 break-words">
          {sub}
        </p>
      ) : (
        <div className="mt-auto" />
      )}
      {clickable && (
        <ArrowRight className="absolute top-4 end-3 size-3.5 text-muted-foreground/70 transition-all group-hover:text-primary group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
        {card}
      </Link>
    );
  }

  return card;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </h2>
  );
}

/** Shared 12-col grid so every KPI row lines up on the same vertical rhythm. */
const KPI_GRID = 'grid grid-cols-12 gap-3';
const KPI_SPAN_SIXTH = 'col-span-6 sm:col-span-4 lg:col-span-2'; // 6-up
const KPI_SPAN_QUARTER = 'col-span-6 sm:col-span-6 lg:col-span-3'; // 4-up
const KPI_SPAN_HALF = 'col-span-12 sm:col-span-6'; // 2-up


export default function DashboardPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [adminStats, setAdminStats] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [contractAlerts, setContractAlerts] = useState<ContractExpiryAlert[]>([]);
  const [alertsError, setAlertsError] = useState('');

  useEffect(() => {
    if (isSuperAdmin) {
      setLoading(true);
      api.admin.dashboard().then(setAdminStats).catch(() => setAdminStats(null)).finally(() => setLoading(false));
      return;
    }
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
          <div className="container mx-auto px-4 py-8 space-y-6">
            <div className="mb-8 rounded-2xl border border-primary/20 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 md:p-8 text-white shadow-lg shadow-primary/10">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/25 ring-1 ring-white/15">
                  <Shield className="size-7 text-orange-300" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <h1 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-sm sm:text-4xl">
                    {isSuperAdmin
                      ? 'Platform Admin'
                      : `Welcome back${user?.full_name ? `, ${user.full_name}` : ''}`}
                  </h1>
                  <p className="mt-2 text-base font-semibold text-slate-100 sm:text-lg">
                    {isSuperAdmin
                      ? 'Full platform control — companies, users, invoices, payments, and packages'
                      : 'Operations Command Centre'}
                  </p>
                  {!isSuperAdmin && (
                    <p className="mt-1 text-sm font-medium text-slate-200">
                      Live metrics for staffing, compliance, and finance.
                    </p>
                  )}
                </div>
                {!isSuperAdmin && stats && (
                  <div className="flex flex-wrap gap-3 text-sm">
                    <Link
                      href="/rota?tab=active"
                      className="rounded-full bg-cyan-500/30 px-3 py-1.5 ring-1 ring-cyan-400/40 transition-colors hover:bg-cyan-500/40"
                    >
                      <span className="font-medium text-cyan-50">Active rotas</span>{' '}
                      <strong className="text-white">{stats.rotas_active ?? 0}</strong>
                      <span className="text-cyan-100/90"> / {stats.rotas_total ?? 0}</span>
                    </Link>
                    <Link
                      href="/rota"
                      className="rounded-full bg-sky-500/30 px-3 py-1.5 ring-1 ring-sky-400/40 transition-colors hover:bg-sky-500/40"
                    >
                      <span className="font-medium text-sky-50">Today&apos;s shifts</span>{' '}
                      <strong className="text-white">{stats.shifts_today}</strong>
                    </Link>
                    <Link
                      href="/attendance"
                      className="rounded-full bg-emerald-500/30 px-3 py-1.5 ring-1 ring-emerald-400/40 transition-colors hover:bg-emerald-500/40"
                    >
                      <span className="font-medium text-emerald-50">Present</span>{' '}
                      <strong className="text-white">{stats.present_count}</strong>
                    </Link>
                    <Link
                      href="/attendance"
                      className="rounded-full bg-red-500/30 px-3 py-1.5 ring-1 ring-red-400/40 transition-colors hover:bg-red-500/40"
                    >
                      <span className="font-medium text-red-50">Absent</span>{' '}
                      <strong className="text-white">{stats.absent_count}</strong>
                    </Link>
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
                <div className="space-y-8">
                  <section>
                    <SectionTitle>Workforce & compliance</SectionTitle>
                    <div className={KPI_GRID}>
                      <div className={KPI_SPAN_SIXTH}>
                        <Kpi label="Staff" value={stats.active_guards} sub="Directory total" icon={Users} accent="text-blue-700 dark:text-blue-400" href="/guards" />
                      </div>
                      <div className={KPI_SPAN_SIXTH}>
                        <Kpi label="Sites" value={stats.sites_count} sub="Active locations" icon={MapPin} accent="text-green-700 dark:text-green-400" href="/sites" />
                      </div>
                      <div className={KPI_SPAN_SIXTH}>
                        <Kpi label="Clients" value={stats.clients_count} sub="Client accounts" icon={Building2} accent="text-purple-700 dark:text-purple-400" href="/clients" />
                      </div>
                      <div className={KPI_SPAN_SIXTH}>
                        <Kpi
                          label="Docs expiring"
                          value={stats.expiring_documents}
                          sub="Within 30 days"
                          icon={FolderOpen}
                          accent="text-amber-700 dark:text-amber-400"
                          warn={stats.expiring_documents > 0}
                          href="/documents"
                        />
                      </div>
                      <div className={KPI_SPAN_SIXTH}>
                        <Kpi
                          label="SIA expiring"
                          value={stats.sia_expiring_30d}
                          sub="Within 30 days"
                          icon={BadgeCheck}
                          accent="text-amber-700 dark:text-amber-400"
                          warn={stats.sia_expiring_30d > 0}
                          href="/guards"
                        />
                      </div>
                      <div className={KPI_SPAN_SIXTH}>
                        <Kpi
                          label="Contracts"
                          value={stats.contracts_expiring_soon}
                          sub="Client contracts (30d)"
                          icon={CalendarCheck}
                          accent="text-orange-700 dark:text-orange-400"
                          warn={stats.contracts_expiring_soon > 0}
                          href="/clients"
                        />
                      </div>
                    </div>
                  </section>

                  <section>
                    <SectionTitle>Rotas</SectionTitle>
                    <div className={KPI_GRID}>
                      <div className={KPI_SPAN_HALF}>
                        <Kpi
                          label="Total rotas"
                          value={stats.rotas_total ?? 0}
                          sub="All saved rotas"
                          icon={CalendarRange}
                          accent="text-cyan-700 dark:text-cyan-400"
                          href="/rota"
                        />
                      </div>
                      <div className={KPI_SPAN_HALF}>
                        <Kpi
                          label="Active rotas"
                          value={stats.rotas_active ?? 0}
                          sub="End date today or later"
                          icon={Calendar}
                          accent="text-cyan-700 dark:text-cyan-400"
                          href="/rota?tab=active"
                        />
                      </div>
                    </div>
                  </section>

                  <section>
                    <SectionTitle>Shifts & attendance</SectionTitle>
                    <div className={KPI_GRID}>
                      <div className={KPI_SPAN_QUARTER}>
                        <Kpi label="Shifts today" value={stats.shifts_today} sub="Scheduled today" icon={Calendar} accent="text-cyan-700 dark:text-cyan-400" href="/rota" />
                      </div>
                      <div className={KPI_SPAN_QUARTER}>
                        <Kpi label="Shifts (7 days)" value={stats.upcoming_shifts} sub="From today" icon={Activity} accent="text-indigo-700 dark:text-indigo-400" href="/rota" />
                      </div>
                      <div className={KPI_SPAN_QUARTER}>
                        <Kpi
                          label="Late (30d)"
                          value={stats.late_count}
                          sub="Last 30 days"
                          icon={Clock}
                          warn={stats.late_count > 0}
                          accent="text-red-700 dark:text-red-400"
                          href="/attendance"
                        />
                      </div>
                      <div className={KPI_SPAN_QUARTER}>
                        <Kpi
                          label="Present today"
                          value={stats.present_count}
                          sub="On duty today"
                          icon={BadgeCheck}
                          accent="text-emerald-700 dark:text-emerald-400"
                          href="/attendance"
                        />
                      </div>
                    </div>
                  </section>

                  <section>
                    <SectionTitle>Finance</SectionTitle>
                    <div className={KPI_GRID}>
                      <div className={KPI_SPAN_QUARTER}>
                        <Kpi
                          label="Payroll (all time)"
                          value={gbp(stats.revenue_total)}
                          sub="Cumulative payroll"
                          icon={PoundSterling}
                          accent="text-emerald-700 dark:text-emerald-400"
                          href="/payroll"
                        />
                      </div>
                      <div className={KPI_SPAN_QUARTER}>
                        <Kpi label="Payroll MTD" value={gbp(stats.payroll_mtd)} sub="Month to date" icon={TrendingUp} accent="text-emerald-700 dark:text-emerald-400" href="/payroll" />
                      </div>
                      <div className={KPI_SPAN_QUARTER}>
                        <Kpi label="Invoiced total" value={gbp(stats.invoice_total)} sub="All invoices" icon={FileText} accent="text-rose-700 dark:text-rose-400" href="/invoices" />
                      </div>
                      <div className={KPI_SPAN_QUARTER}>
                        <Kpi
                          label="Outstanding"
                          value={gbp(stats.invoice_outstanding)}
                          sub="Draft + sent"
                          icon={FileText}
                          accent="text-rose-700 dark:text-rose-400"
                          warn={stats.invoice_outstanding > 0}
                          href="/invoices"
                        />
                      </div>
                    </div>
                  </section>
                </div>

                <section className="mt-8 mb-8">
                  <OverviewCharts
                    shifts={overview.shifts_by_day}
                    attendance={overview.attendance_by_status}
                    payroll={overview.payroll_by_month}
                    operations={overview.operations_compare}
                  />
                </section>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
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
              </>
            )}

            {!isSuperAdmin && !loading && !stats && (
              <Card className="mb-8 border-destructive/30">
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  Could not load dashboard metrics. Check your connection and try refreshing.
                </CardContent>
              </Card>
            )}

            {isSuperAdmin && adminStats && (
              <section className="mb-6">
                <SectionTitle>Platform overview</SectionTitle>
                <div className={KPI_GRID}>
                  <div className={KPI_SPAN_SIXTH}>
                    <Kpi label="Companies" value={adminStats.total_companies} sub={`${adminStats.active_subscriptions} active`} icon={Building2} />
                  </div>
                  <div className={KPI_SPAN_SIXTH}>
                    <Kpi label="Invoices" value={adminStats.total_invoices} sub={`${adminStats.unpaid_invoices} unpaid`} icon={FileText} />
                  </div>
                  <div className={KPI_SPAN_SIXTH}>
                    <Kpi label="Overdue" value={adminStats.overdue_invoices} icon={AlertTriangle} warn={adminStats.overdue_invoices > 0} />
                  </div>
                  <div className={KPI_SPAN_SIXTH}>
                    <Kpi label="Outstanding" value={gbp(adminStats.outstanding_balance)} icon={TrendingUp} accent="text-red-600" />
                  </div>
                  <div className={KPI_SPAN_SIXTH}>
                    <Kpi label="Collected" value={gbp(adminStats.total_collected)} icon={Wallet} accent="text-green-600" />
                  </div>
                  <div className={KPI_SPAN_SIXTH}>
                    <Kpi label="Active users" value={adminStats.platform_usage.total_active_users} sub={`${adminStats.platform_usage.storage_mb} MB storage`} icon={Users} />
                  </div>
                </div>
              </section>
            )}

            <section>
              <SectionTitle>{isSuperAdmin ? 'Admin' : 'Quick access'}</SectionTitle>
              <div className={`grid gap-3 ${isSuperAdmin ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
                {tiles.map(({ href, title, desc, icon: Icon, color }) => (
                  <Link key={href} href={href} className="group block cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                    <Card className="h-full border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md group-hover:bg-card">
                      <CardHeader className="flex flex-row items-start gap-3 py-4">
                        <div className="rounded-lg bg-primary/15 p-2 transition-colors group-hover:bg-primary/20 dark:bg-primary/25">
                          <Icon className={cn('size-4', color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm leading-tight">{title}</CardTitle>
                          <CardDescription className="mt-0.5 text-xs leading-snug line-clamp-2 break-words">{desc}</CardDescription>
                        </div>
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-all group-hover:text-primary group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
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
