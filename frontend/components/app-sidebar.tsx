'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { isAdminBypass } from '@/lib/permissions';
import type { ModuleAccess } from '@/lib/types';
import {
  AlertTriangle,
  Building2,
  Calendar,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  FolderOpen,
  Gift,
  LayoutDashboard,
  LucideIcon,
  Mail,
  MapPin,
  MapPinned,
  MessageSquare,
  PoundSterling,
  Receipt,
  Settings,
  Shield,
  Target,
  UserCircle,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { CompanyBrand } from '@/components/company-brand';
import { cn } from '@/lib/utils';
import { moduleNavAllowed } from '@/lib/nav-modules';

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  FolderOpen,
  UserCog,
  Clock,
  Shield,
  UserCircle,
  MapPin,
  ClipboardList,
  Calendar,
  MapPinned,
  AlertTriangle,
  Building2,
  Target,
  PoundSterling,
  FileText,
  CreditCard,
  Receipt,
  Gift,
  MessageSquare,
  Mail,
};

const SECTION_ORDER = [
  'sectionOverview',
  'sectionHr',
  'sectionOperations',
  'sectionSales',
  'sectionFinance',
  'sectionReports',
  'sectionSettings',
];

function moduleIcon(name: string): LucideIcon {
  return ICON_MAP[name] || LayoutDashboard;
}

function active(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function moduleNavAllowedLocal(user: ReturnType<typeof useAuth>['user'], m: ModuleAccess) {
  return moduleNavAllowed(user, m);
}

export function AppSidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const ts = useTranslations('sidebar');
  const isSuperAdmin = user?.role === 'super_admin';

  const grouped = useMemo(() => {
    const access = user?.module_access;
    if (!access?.length) return [];
    const bySection: Record<string, ModuleAccess[]> = {};
    for (const m of access) {
      if (!moduleNavAllowedLocal(user, m)) continue;
      const sec = m.section_key || 'sectionOperations';
      if (!bySection[sec]) bySection[sec] = [];
      bySection[sec].push(m);
    }
    return SECTION_ORDER
      .filter((sec) => bySection[sec]?.length)
      .map((sec) => ({
        titleKey: sec,
        items: bySection[sec].sort((a, b) => a.sidebar_order - b.sidebar_order),
      }));
  }, [user]);

  if (isSuperAdmin) {
    return (
      <aside className="hidden h-dvh min-h-0 w-48 shrink-0 flex-col overflow-hidden border-r bg-slate-900 text-slate-100 md:flex">
        <div className="shrink-0 p-3 border-b border-slate-700/80">
          <CompanyBrand />
        </div>
        <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-1.5">
          <div>
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{ts('sectionAdmin')}</p>
            <div className="space-y-0.5 mt-1">
              {[
                { href: '/admin/companies', labelKey: 'adminCompanies', icon: Building2 },
                { href: '/admin/users', labelKey: 'adminUsers', icon: Users },
                { href: '/admin/admins', labelKey: 'adminAdmins', icon: UserCog },
                { href: '/admin/invoices', labelKey: 'adminInvoices', icon: FileText },
                { href: '/admin/payments', labelKey: 'adminPayments', icon: CreditCard },
                { href: '/admin/receipts', labelKey: 'adminReceipts', icon: Wallet },
                { href: '/admin/packages', labelKey: 'adminPackages', icon: Gift },
                { href: '/admin/email', labelKey: 'adminSmtp', icon: Mail },
                { href: '/admin/logs', labelKey: 'adminLogs', icon: Clock },
              ].map(({ href, labelKey, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                    pathname === href || pathname.startsWith(`${href}/`)
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-300 hover:bg-slate-800/80'
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{ts(labelKey)}</span>
                </Link>
              ))}
            </div>
          </div>
        </nav>
      </aside>
    );
  }

  return (
    <aside className="hidden h-dvh min-h-0 w-48 shrink-0 flex-col overflow-hidden border-r bg-slate-900 text-slate-100 md:flex">
      <div className="shrink-0 p-3 border-b border-slate-700/80">
        <CompanyBrand />
      </div>
      <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-1.5">
        {grouped.map((section) => (
          <div key={section.titleKey}>
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              {section.titleKey === 'sectionSettings' ? <Settings className="size-3" /> : null}
              {ts(section.titleKey)}
            </p>
            <div className="space-y-0.5 mt-1">
              {section.items.map((m) => {
                const Icon = moduleIcon(m.icon);
                return (
                  <Link
                    key={m.key}
                    href={m.sidebar_path}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                      active(pathname, m.sidebar_path) ? 'bg-slate-800 text-white font-medium' : 'text-slate-300 hover:bg-slate-800/80'
                    )}
                  >
                    <Icon className="size-4 shrink-0 opacity-90" />
                    <span className="truncate">{m.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
