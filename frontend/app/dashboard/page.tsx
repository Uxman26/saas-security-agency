'use client';

import { useMemo } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { OverviewCharts } from '@/components/dashboard/overview-charts';
import {
  DashboardHero,
} from '@/components/dashboard/dashboard-hero';
import {
  DashboardKpi,
  DashboardSection,
  KPI_GRID,
  KPI_SPAN_HALF,
  KPI_SPAN_QUARTER,
  KPI_SPAN_SIXTH,
} from '@/components/dashboard/dashboard-kpi';
import { InlineDashboardSkeleton } from '@/components/skeletons';
import { MagicCard } from '@/components/ui/magic-card';
import { BlurFade } from '@/components/ui/blur-fade';
import { Card, CardContent } from '@/components/ui/card';
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
  Shield,
  CalendarRange,
  CalendarCheck,
  Activity,
  BadgeCheck,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can, PERMS } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import {
  useAdminDashboard,
  useDashboardAlerts,
  useDashboardOverview,
} from '@/hooks/use-dashboard';

const companyTiles = [
  { href: '/guards', title: 'Staff', desc: 'Manage staff & compliance', icon: Users, color: 'text-blue-600 dark:text-blue-400', perm: 'guards.read' },
  { href: '/sites', title: 'Sites', desc: 'Manage deployment sites', icon: MapPin, color: 'text-green-600 dark:text-green-400', perm: 'sites.read' },
  { href: '/clients', title: 'Clients', desc: 'Manage client accounts', icon: Building2, color: 'text-purple-600 dark:text-purple-400', perm: 'clients.read' },
  { href: '/assignments', title: 'Assignments', desc: 'Schedule staff shifts', icon: ClipboardList, color: 'text-orange-600 dark:text-orange-400', perm: 'assign.read' },
  { href: '/rota', title: 'Rotas & Shifts', desc: 'Planner and assignment grid', icon: Calendar, color: 'text-cyan-600 dark:text-cyan-400', perm: 'assign.read' },
  { href: '/attendance', title: 'Attendance', desc: 'Track staff attendance', icon: Clock, color: 'text-teal-600 dark:text-teal-400', perm: 'attend.read' },
  { href: '/documents', title: 'Documents', desc: 'Staff documents & expiry', icon: FolderOpen, color: 'text-amber-600 dark:text-amber-400', perm: 'doc.read' },
  { href: '/contractors', title: 'Contractors', desc: 'Main & sub contractor onboarding', icon: UserCog, color: 'text-indigo-600 dark:text-indigo-400', perm: PERMS.contractorView },
  { href: '/payroll', title: 'Payroll', desc: 'Calculate & manage payroll', icon: PoundSterling, color: 'text-emerald-600 dark:text-emerald-400', perm: 'payroll.read' },
  { href: '/reports', title: 'Reports', desc: 'Staff, financial & usage reports', icon: ClipboardList, color: 'text-indigo-600 dark:text-indigo-400', perm: 'rep.read' },
  { href: '/invoices', title: 'Invoices', desc: 'Client billing & invoices', icon: FileText, color: 'text-rose-600 dark:text-rose-400', perm: 'inv.read' },
  { href: '/payments', title: 'Payments', desc: 'Track received payments', icon: CreditCard, color: 'text-violet-600 dark:text-violet-400', perm: 'pay.read' },
  { href: '/allowances', title: 'Allowances', desc: 'Rates & allowance config', icon: Wallet, color: 'text-sky-600 dark:text-sky-400', perm: 'allow.read' },
  { href: '/settings/special-days', title: 'Special days', desc: 'Bank holidays & double-rate dates', icon: CalendarRange, color: 'text-amber-600 dark:text-amber-400', perm: 'allow.read' },
  { href: '/settings/roles', title: 'Roles & users', desc: 'Roles, permissions, and user assignment', icon: Shield, color: 'text-primary', perm: 'roles.read' },
];

const adminTiles = [
  { href: '/dashboard', title: 'Dashboard', desc: 'Platform overview & billing stats', icon: Shield, color: 'text-primary' },
  { href: '/admin/companies', title: 'Companies', desc: 'Tenants, modules & user limits', icon: Building2, color: 'text-primary' },
  { href: '/admin/users', title: 'Users', desc: 'All platform users — activate or deactivate', icon: Users, color: 'text-blue-600 dark:text-blue-400' },
  { href: '/admin/admins', title: 'Admins', desc: 'Tenant admin accounts & module access', icon: UserCog, color: 'text-indigo-600 dark:text-indigo-400' },
  { href: '/admin/invoices', title: 'Subscription invoices', desc: 'Auto-generated platform billing', icon: FileText, color: 'text-rose-600 dark:text-rose-400' },
  { href: '/admin/payments', title: 'Payments', desc: 'Subscription payment records', icon: CreditCard, color: 'text-violet-600 dark:text-violet-400' },
  { href: '/admin/receipts', title: 'Receipts', desc: 'Signup payments & mark paid', icon: Wallet, color: 'text-emerald-600 dark:text-emerald-400' },
  { href: '/admin/packages', title: 'Packages', desc: 'Plan pricing, limits & SMS/email features', icon: Shield, color: 'text-amber-600 dark:text-amber-400' },
  { href: '/admin/email', title: 'SMTP email', desc: 'Platform mail server for system emails', icon: Shield, color: 'text-blue-600 dark:text-blue-400' },
  { href: '/admin/logs', title: 'Activity logs', desc: 'Login history & audit trail', icon: Activity, color: 'text-cyan-600 dark:text-cyan-400' },
];

function QuickTile({
  href,
  title,
  desc,
  icon: Icon,
  color,
  delay = 0,
}: {
  href: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  delay?: number;
}) {
  return (
    <BlurFade delay={delay} inView>
      <Link
        href={href}
        className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <MagicCard
          className="h-full rounded-2xl"
          gradientSize={200}
          gradientFrom="#F45100"
          gradientTo="#FF6A1F"
          gradientColor="rgba(224,78,0,0.07)"
          gradientOpacity={0.5}
        >
          <div className="flex items-start gap-3 p-4 transition-transform duration-200 group-hover:-translate-y-0.5">
            <div className="rounded-xl bg-primary/10 p-2.5 ring-1 ring-border/50 transition-colors group-hover:bg-primary/15 dark:bg-primary/20">
              <Icon className={cn('size-4', color)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-foreground">{title}</p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground line-clamp-2">{desc}</p>
            </div>
            <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary rtl:group-hover:-translate-x-0.5" />
          </div>
        </MagicCard>
      </Link>
    </BlurFade>
  );
}

function AlertPanel({
  title,
  icon: Icon,
  children,
  footer,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <MagicCard
      className="h-full rounded-2xl"
      gradientSize={220}
      gradientFrom="#F59E0B"
      gradientTo="#FBBF24"
      gradientColor="rgba(245,158,11,0.08)"
      gradientOpacity={0.5}
    >
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-400">
          <Icon className="size-4" />
          {title}
        </div>
        {children}
        {footer}
      </div>
    </MagicCard>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  const {
    data: overview,
    isLoading: overviewLoading,
  } = useDashboardOverview(!isSuperAdmin && Boolean(user));

  const {
    data: alertsData,
    isError: alertsIsError,
    error: alertsQueryError,
  } = useDashboardAlerts(!isSuperAdmin && Boolean(user));

  const { data: adminStats, isLoading: adminLoading } = useAdminDashboard(
    isSuperAdmin && Boolean(user)
  );

  // Only block UI when we have no cached data yet
  const loading = isSuperAdmin ? adminLoading && !adminStats : overviewLoading && !overview;
  const alerts = alertsData?.compliance ?? [];
  const contractAlerts = alertsData?.contracts ?? [];
  const alertsError = alertsIsError
    ? (alertsQueryError as Error)?.message || 'Could not load alerts'
    : '';

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
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_55%),linear-gradient(to_bottom,var(--background),color-mix(in_oklab,var(--muted)_70%,var(--background)))] dark:bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_52%),linear-gradient(to_bottom,#0F172A,#0F172A)]">
          <div className="container mx-auto space-y-6 px-4 py-8">
            <DashboardHero
              title={
                isSuperAdmin
                  ? 'Platform Admin'
                  : `Welcome back${user?.full_name ? `, ${user.full_name}` : ''}`
              }
              subtitle={
                isSuperAdmin
                  ? 'Full platform control — companies, users, invoices, payments, and packages'
                  : 'Operations Command Centre'
              }
              description={
                isSuperAdmin
                  ? undefined
                  : 'Live metrics for staffing, compliance, and finance.'
              }
              pills={
                !isSuperAdmin && stats
                  ? [
                      {
                        href: '/rota?tab=active',
                        label: 'Active rotas',
                        value: (
                          <>
                            {stats.rotas_active ?? 0}
                            <span className="opacity-70"> / {stats.rotas_total ?? 0}</span>
                          </>
                        ),
                        tone: 'amber',
                      },
                      {
                        href: '/rota',
                        label: "Today's shifts",
                        value: stats.shifts_today,
                        tone: 'orange',
                      },
                      {
                        href: '/attendance',
                        label: 'Present',
                        value: stats.present_count,
                        tone: 'emerald',
                      },
                      {
                        href: '/attendance',
                        label: 'Absent',
                        value: stats.absent_count,
                        tone: 'red',
                      },
                    ]
                  : undefined
              }
            />

            {!isSuperAdmin && loading && <InlineDashboardSkeleton />}

            {!isSuperAdmin && !loading && stats && overview && (
              <>
                <div className="space-y-8">
                  <DashboardSection title="Workforce & compliance">
                    <div className={KPI_GRID}>
                      <div className={KPI_SPAN_SIXTH}>
                        <DashboardKpi label="Staff" value={stats.active_guards} sub="Directory total" icon={Users} accent="text-blue-700 dark:text-blue-400" href="/guards" delay={0.05} />
                      </div>
                      <div className={KPI_SPAN_SIXTH}>
                        <DashboardKpi label="Sites" value={stats.sites_count} sub="Active locations" icon={MapPin} accent="text-green-700 dark:text-green-400" href="/sites" delay={0.08} />
                      </div>
                      <div className={KPI_SPAN_SIXTH}>
                        <DashboardKpi label="Clients" value={stats.clients_count} sub="Client accounts" icon={Building2} accent="text-purple-700 dark:text-purple-400" href="/clients" delay={0.11} />
                      </div>
                      <div className={KPI_SPAN_SIXTH}>
                        <DashboardKpi
                          label="Docs expiring"
                          value={stats.expiring_documents}
                          sub="Within 30 days"
                          icon={FolderOpen}
                          accent="text-amber-700 dark:text-amber-400"
                          warn={stats.expiring_documents > 0}
                          href="/documents"
                          delay={0.14}
                        />
                      </div>
                      <div className={KPI_SPAN_SIXTH}>
                        <DashboardKpi
                          label="SIA expiring"
                          value={stats.sia_expiring_30d}
                          sub="Within 30 days"
                          icon={BadgeCheck}
                          accent="text-amber-700 dark:text-amber-400"
                          warn={stats.sia_expiring_30d > 0}
                          href="/guards"
                          delay={0.17}
                        />
                      </div>
                      <div className={KPI_SPAN_SIXTH}>
                        <DashboardKpi
                          label="Contracts"
                          value={stats.contracts_expiring_soon}
                          sub="Client contracts (30d)"
                          icon={CalendarCheck}
                          accent="text-orange-700 dark:text-orange-400"
                          warn={stats.contracts_expiring_soon > 0}
                          href="/clients"
                          delay={0.2}
                        />
                      </div>
                    </div>
                  </DashboardSection>

                  <DashboardSection title="Rotas">
                    <div className={KPI_GRID}>
                      <div className={KPI_SPAN_HALF}>
                        <DashboardKpi
                          label="Total rotas"
                          value={stats.rotas_total ?? 0}
                          sub="All saved rotas"
                          icon={CalendarRange}
                          accent="text-cyan-700 dark:text-cyan-400"
                          href="/rota"
                          delay={0.08}
                        />
                      </div>
                      <div className={KPI_SPAN_HALF}>
                        <DashboardKpi
                          label="Active rotas"
                          value={stats.rotas_active ?? 0}
                          sub="End date today or later"
                          icon={Calendar}
                          accent="text-cyan-700 dark:text-cyan-400"
                          href="/rota?tab=active"
                          delay={0.12}
                        />
                      </div>
                    </div>
                  </DashboardSection>

                  <DashboardSection title="Shifts & attendance">
                    <div className={KPI_GRID}>
                      <div className={KPI_SPAN_QUARTER}>
                        <DashboardKpi label="Shifts today" value={stats.shifts_today} sub="Scheduled today" icon={Calendar} accent="text-cyan-700 dark:text-cyan-400" href="/rota" delay={0.08} />
                      </div>
                      <div className={KPI_SPAN_QUARTER}>
                        <DashboardKpi label="Shifts (7 days)" value={stats.upcoming_shifts} sub="From today" icon={Activity} accent="text-indigo-700 dark:text-indigo-400" href="/rota" delay={0.11} />
                      </div>
                      <div className={KPI_SPAN_QUARTER}>
                        <DashboardKpi
                          label="Late (30d)"
                          value={stats.late_count}
                          sub="Last 30 days"
                          icon={Clock}
                          warn={stats.late_count > 0}
                          accent="text-red-700 dark:text-red-400"
                          href="/attendance"
                          delay={0.14}
                        />
                      </div>
                      <div className={KPI_SPAN_QUARTER}>
                        <DashboardKpi
                          label="Present today"
                          value={stats.present_count}
                          sub="On duty today"
                          icon={BadgeCheck}
                          accent="text-emerald-700 dark:text-emerald-400"
                          href="/attendance"
                          delay={0.17}
                        />
                      </div>
                    </div>
                  </DashboardSection>

                  <DashboardSection title="Finance">
                    <div className={KPI_GRID}>
                      <div className={KPI_SPAN_QUARTER}>
                        <DashboardKpi
                          label="Payroll (all time)"
                          value={Math.round(stats.revenue_total)}
                          prefix="£"
                          sub="Cumulative payroll"
                          icon={PoundSterling}
                          accent="text-emerald-700 dark:text-emerald-400"
                          href="/payroll"
                          delay={0.08}
                        />
                      </div>
                      <div className={KPI_SPAN_QUARTER}>
                        <DashboardKpi
                          label="Payroll MTD"
                          value={Math.round(stats.payroll_mtd)}
                          prefix="£"
                          sub="Month to date"
                          icon={TrendingUp}
                          accent="text-emerald-700 dark:text-emerald-400"
                          href="/payroll"
                          delay={0.11}
                        />
                      </div>
                      <div className={KPI_SPAN_QUARTER}>
                        <DashboardKpi
                          label="Invoiced total"
                          value={Math.round(stats.invoice_total)}
                          prefix="£"
                          sub="All invoices"
                          icon={FileText}
                          accent="text-rose-700 dark:text-rose-400"
                          href="/invoices"
                          delay={0.14}
                        />
                      </div>
                      <div className={KPI_SPAN_QUARTER}>
                        <DashboardKpi
                          label="Outstanding"
                          value={Math.round(stats.invoice_outstanding)}
                          prefix="£"
                          sub="Draft + sent"
                          icon={FileText}
                          accent="text-rose-700 dark:text-rose-400"
                          warn={stats.invoice_outstanding > 0}
                          href="/invoices"
                          delay={0.17}
                        />
                      </div>
                    </div>
                  </DashboardSection>
                </div>

                <DashboardSection title="Trends" className="mt-8 mb-8">
                  <OverviewCharts
                    shifts={overview.shifts_by_day}
                    attendance={overview.attendance_by_status}
                    payroll={overview.payroll_by_month}
                    operations={overview.operations_compare}
                  />
                </DashboardSection>

                <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <MagicCard
                    className="h-full rounded-2xl"
                    gradientSize={220}
                    gradientFrom="#F45100"
                    gradientTo="#FF6A1F"
                    gradientColor="rgba(224,78,0,0.08)"
                    gradientOpacity={0.5}
                  >
                    <div className="p-4 sm:p-5">
                      <p className="text-sm font-semibold text-foreground">Contractors</p>
                      <p className="mb-4 text-xs text-muted-foreground">Main and sub directory</p>
                      <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5 dark:bg-white/5">
                          <span className="text-muted-foreground">Main</span>
                          <span>
                            <strong className="tabular-nums">{stats.main_contractors_active}</strong>
                            <span className="text-muted-foreground"> / {stats.main_contractors_total} active</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5 dark:bg-white/5">
                          <span className="text-muted-foreground">Sub</span>
                          <span>
                            <strong className="tabular-nums">{stats.sub_contractors_active}</strong>
                            <span className="text-muted-foreground"> / {stats.sub_contractors_total} active</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </MagicCard>

                  {alertsError && (
                    <Card className="border-destructive/40 bg-destructive/10">
                      <CardContent className="pt-6 text-sm text-destructive">{alertsError}</CardContent>
                    </Card>
                  )}

                  {contractAlerts.length > 0 && (
                    <AlertPanel
                      title={`Contracts (${contractAlerts.length})`}
                      icon={CalendarCheck}
                      footer={
                        <Link href="/clients" className="mt-3 inline-block text-xs font-medium text-amber-800 underline dark:text-amber-400">
                          Manage clients
                        </Link>
                      }
                    >
                      <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-amber-900 dark:text-amber-300">
                        {contractAlerts.slice(0, 6).map((a) => (
                          <li key={a.client_id}>
                            <span className="font-medium">{a.client_name}</span> — {a.contract_end_date}
                          </li>
                        ))}
                      </ul>
                    </AlertPanel>
                  )}

                  {alerts.length > 0 && (
                    <AlertPanel
                      title={`Compliance (${alerts.length})`}
                      icon={AlertTriangle}
                      footer={
                        <Link href="/documents" className="mt-3 inline-block text-xs font-medium text-amber-800 underline dark:text-amber-400">
                          View documents
                        </Link>
                      }
                    >
                      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-amber-900 dark:text-amber-300">
                        {alerts.slice(0, 8).map((a, i) => (
                          <li key={i}>
                            <span className="font-medium">{a.guard_name}</span> — {a.document_type}
                          </li>
                        ))}
                      </ul>
                    </AlertPanel>
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
              <DashboardSection title="Platform overview" className="mb-6">
                <div className={KPI_GRID}>
                  <div className={KPI_SPAN_SIXTH}>
                    <DashboardKpi label="Companies" value={adminStats.total_companies} sub={`${adminStats.active_subscriptions} active`} icon={Building2} delay={0.05} />
                  </div>
                  <div className={KPI_SPAN_SIXTH}>
                    <DashboardKpi label="Invoices" value={adminStats.total_invoices} sub={`${adminStats.unpaid_invoices} unpaid`} icon={FileText} delay={0.08} />
                  </div>
                  <div className={KPI_SPAN_SIXTH}>
                    <DashboardKpi label="Overdue" value={adminStats.overdue_invoices} icon={AlertTriangle} warn={adminStats.overdue_invoices > 0} delay={0.11} />
                  </div>
                  <div className={KPI_SPAN_SIXTH}>
                    <DashboardKpi label="Outstanding" value={Math.round(adminStats.outstanding_balance)} prefix="£" icon={TrendingUp} accent="text-red-600 dark:text-red-400" delay={0.14} />
                  </div>
                  <div className={KPI_SPAN_SIXTH}>
                    <DashboardKpi label="Collected" value={Math.round(adminStats.total_collected)} prefix="£" icon={Wallet} accent="text-green-600 dark:text-green-400" delay={0.17} />
                  </div>
                  <div className={KPI_SPAN_SIXTH}>
                    <DashboardKpi label="Active users" value={adminStats.platform_usage.total_active_users} sub={`${adminStats.platform_usage.storage_mb} MB storage`} icon={Users} delay={0.2} />
                  </div>
                </div>
              </DashboardSection>
            )}

            <DashboardSection title={isSuperAdmin ? 'Admin' : 'Quick access'}>
              <div
                className={cn(
                  'grid gap-3',
                  isSuperAdmin ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                )}
              >
                {tiles.map(({ href, title, desc, icon, color }, i) => (
                  <QuickTile
                    key={href}
                    href={href}
                    title={title}
                    desc={desc}
                    icon={icon}
                    color={color}
                    delay={0.04 + i * 0.03}
                  />
                ))}
              </div>
            </DashboardSection>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
