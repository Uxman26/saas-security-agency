'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  ArrowUpRight,
  Building2,
  Calendar,
  CalendarRange,
  ClipboardList,
  Clock,
  CreditCard,
  FileBarChart,
  FileText,
  FolderOpen,
  MapPin,
  PoundSterling,
  Shield,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can, PERMS } from '@/lib/permissions';
import { SectionHeader } from '../kit/section-header';

const TILES = [
  { href: '/guards', k: 'staff', icon: Users, perm: 'guards.read' },
  { href: '/sites', k: 'sites', icon: MapPin, perm: 'sites.read' },
  { href: '/clients', k: 'clients', icon: Building2, perm: 'clients.read' },
  { href: '/assignments', k: 'assignments', icon: ClipboardList, perm: 'assign.read' },
  { href: '/rota', k: 'rota', icon: Calendar, perm: 'assign.read' },
  { href: '/attendance', k: 'attendance', icon: Clock, perm: 'attend.read' },
  { href: '/documents', k: 'documents', icon: FolderOpen, perm: 'doc.read' },
  { href: '/contractors', k: 'contractors', icon: UserCog, perm: PERMS.contractorView },
  { href: '/payroll', k: 'payroll', icon: PoundSterling, perm: 'payroll.read' },
  { href: '/reports', k: 'reports', icon: FileBarChart, perm: 'rep.read' },
  { href: '/invoices', k: 'invoices', icon: FileText, perm: 'inv.read' },
  { href: '/payments', k: 'payments', icon: CreditCard, perm: 'pay.read' },
  { href: '/allowances', k: 'allowances', icon: Wallet, perm: 'allow.read' },
  { href: '/settings/special-days', k: 'specialDays', icon: CalendarRange, perm: 'allow.read' },
  { href: '/settings/roles', k: 'roles', icon: Shield, perm: 'roles.read' },
];

function QuickAccessInner() {
  const t = useTranslations('dashboard.quick');
  const { user } = useAuth();
  const tiles = useMemo(() => TILES.filter((x) => can(user, x.perm)), [user]);
  if (!tiles.length) return null;
  return (
    <section aria-labelledby="dash-quick" className="dash-card p-5 sm:p-6">
      <SectionHeader id="dash-quick" title={t('title')} subtitle={t('subtitle')} />
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-8">
        {tiles.map(({ href, k, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="group/q flex h-full items-center gap-3 rounded-xl p-2.5 ring-1 ring-transparent transition-all hover:bg-foreground/[0.03] hover:ring-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.04] text-foreground/70 ring-1 ring-hairline transition-colors group-hover/q:bg-brand-50 group-hover/q:text-brand-600 dark:bg-white/5">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{t(`tile.${k}`)}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{t(`desc.${k}`)}</span>
              </span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover/q:text-primary rtl:-scale-x-100" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const QuickAccess = memo(QuickAccessInner);
export default QuickAccess;
