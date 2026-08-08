'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
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

const asideClass =
  'hidden h-dvh min-h-0 w-48 shrink-0 flex-col overflow-hidden border-e border-sidebar-border bg-sidebar text-sidebar-foreground md:flex';

function navLinkClass(isActive: boolean) {
  return cn(
    'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
    isActive
      ? 'bg-[color-mix(in_oklab,var(--sidebar-primary)_18%,transparent)] font-medium text-sidebar-primary shadow-sm ring-1 ring-[color-mix(in_oklab,var(--sidebar-primary)_35%,transparent)]'
      : 'text-sidebar-foreground/70 hover:bg-[color-mix(in_oklab,var(--sidebar-primary)_12%,transparent)] hover:text-sidebar-primary'
  );
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
    return SECTION_ORDER.filter((sec) => bySection[sec]?.length).map((sec) => ({
      titleKey: sec,
      items: bySection[sec].sort((a, b) => a.sidebar_order - b.sidebar_order),
    }));
  }, [user]);

  if (isSuperAdmin) {
    return (
      <aside className={asideClass}>
        <div className="shrink-0 border-b border-sidebar-border p-3">
          <CompanyBrand />
        </div>
        <nav className="sidebar-nav-scroll min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-1.5">
          <div>
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
              {ts('sectionAdmin')}
            </p>
            <div className="mt-1 space-y-0.5">
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
                  className={navLinkClass(pathname === href || pathname.startsWith(`${href}/`))}
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
    <aside className={asideClass}>
      <div className="shrink-0 border-b border-sidebar-border p-3">
        <CompanyBrand />
      </div>
      <nav className="sidebar-nav-scroll min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-1.5">
        {grouped.map((section) => (
          <div key={section.titleKey}>
            <p className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
              {section.titleKey === 'sectionSettings' ? <Settings className="size-3" /> : null}
              {ts(section.titleKey)}
            </p>
            <div className="mt-1 space-y-0.5">
              {section.items.map((m) => {
                const Icon = moduleIcon(m.icon);
                return (
                  <Link
                    key={m.key}
                    href={m.sidebar_path}
                    className={navLinkClass(active(pathname, m.sidebar_path))}
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
