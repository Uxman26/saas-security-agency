'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import type { ModuleAccess } from '@/lib/types';
import {
  AlertTriangle,
  ShieldAlert,
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
} from 'lucide-react';
import { CompanyBrand } from '@/components/company-brand';
import { cn } from '@/lib/utils';
import { ADMIN_NAV, isAdminNavActive } from '@/lib/admin-nav';
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
  ShieldAlert,
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
  'sectionScheduling',
  'sectionField',
  'sectionSafety',
  'sectionSales',
  'sectionFinance',
  'sectionReports',
  'sectionSettings',
  // Kept last so a module still carrying the old catch-all section — or one added
  // through the module registry, which defaults to it — never disappears from the nav.
  'sectionOperations',
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
    // border-s on every state, transparent when idle: colouring it only when active
    // would shift the label 3px sideways as you navigate.
    'flex items-center gap-2 rounded-e-lg border-s-[3px] border-transparent px-2 py-1.5 text-sm transition-colors',
    isActive
      ? 'border-s-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-primary'
      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-primary'
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
            <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
              {ts('sectionAdmin')}
            </p>
            <div className="mt-1 space-y-0.5">
              {ADMIN_NAV.map(({ href, labelKey, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={navLinkClass(isAdminNavActive(pathname, href))}
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
            <p className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
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
