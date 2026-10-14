'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  Calendar,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  Clock,
  CreditCard,
  FilePlus,
  FileText,
  FolderOpen,
  Gift,
  LayoutDashboard,
  type LucideIcon,
  Mail,
  MapPin,
  MapPinned,
  MessageSquare,
  PoundSterling,
  Receipt,
  Repeat,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  Store,
  Target,
  UserCircle,
  UserCog,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useModuleLabel } from '@/lib/module-i18n';
import { isNavPathActive } from '@/lib/sidebar-sections';
import type { ModuleAccess } from '@/lib/types';
import type { AdminNavItem } from '@/lib/admin-nav';
import { isAdminNavActive } from '@/lib/admin-nav';
import { storageGet, storageSet } from '@/lib/safe-storage';

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
  CalendarClock,
  MapPinned,
  AlertTriangle,
  ShieldAlert,
  Building2,
  Target,
  PoundSterling,
  FileText,
  FilePlus,
  ScrollText,
  CreditCard,
  Receipt,
  Gift,
  MessageSquare,
  Mail,
  Store,
  Repeat,
  BookOpen,
};

const COLLAPSE_KEY = 'controlops-sidebar-collapsed-sections';

function moduleIcon(name: string): LucideIcon {
  return ICON_MAP[name] || LayoutDashboard;
}

function readCollapsed(): Set<string> {
  try {
    const raw = storageGet(COLLAPSE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function navLinkClass(isActive: boolean, compact: boolean) {
  return cn(
    'flex items-center gap-2.5 rounded-md border-s-[3px] border-transparent transition-colors outline-none',
    'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar',
    compact ? 'px-2 py-1.5 text-sm leading-snug' : 'px-2.5 py-2.5 text-sm leading-snug',
    isActive
      ? 'border-s-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-primary shadow-sm'
      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/80 hover:text-sidebar-primary'
  );
}

function SectionHeading({
  title,
  open,
  onToggle,
  hasActive,
  leading,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  hasActive: boolean;
  leading?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-start transition-colors',
        'text-xs font-bold uppercase tracking-[0.05em]',
        'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        hasActive && 'text-sidebar-primary/90'
      )}
    >
      <ChevronDown
        className={cn(
          'size-3.5 shrink-0 transition-transform duration-200',
          !open && '-rotate-90'
        )}
        aria-hidden
      />
      {leading}
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </button>
  );
}

function useSectionCollapse(activeSectionKey: string | null) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed());

  useEffect(() => {
    if (!activeSectionKey) return;
    setCollapsed((prev) => {
      if (!prev.has(activeSectionKey)) return prev;
      const next = new Set(prev);
      next.delete(activeSectionKey);
      storageSet(COLLAPSE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, [activeSectionKey]);

  const toggle = useCallback(
    (key: string) => {
      if (key === activeSectionKey) return;
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        storageSet(COLLAPSE_KEY, JSON.stringify([...next]));
        return next;
      });
    },
    [activeSectionKey]
  );

  const isOpen = useCallback(
    (key: string) => {
      if (key === activeSectionKey) return true;
      return !collapsed.has(key);
    },
    [collapsed, activeSectionKey]
  );

  return { isOpen, toggle };
}

export function TenantSidebarNav({
  sections,
  onNavigate,
  compact = true,
}: {
  sections: { titleKey: string; items: ModuleAccess[] }[];
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const ts = useTranslations('sidebar');
  const moduleLabel = useModuleLabel();

  const activeSectionKey = useMemo(() => {
    for (const section of sections) {
      if (section.items.some((m) => isNavPathActive(pathname, m.sidebar_path))) return section.titleKey;
    }
    return null;
  }, [sections, pathname]);

  const { isOpen, toggle } = useSectionCollapse(activeSectionKey);

  return (
    <div className={cn('space-y-3', !compact && 'space-y-4')}>
      {sections.map((section) => {
        const open = isOpen(section.titleKey);
        const hasActive = section.titleKey === activeSectionKey;
        return (
          <div key={section.titleKey} className="min-w-0">
            <SectionHeading
              title={ts(section.titleKey)}
              open={open}
              onToggle={() => toggle(section.titleKey)}
              hasActive={hasActive}
              leading={
                section.titleKey === 'sectionSettings' ? (
                  <Settings className="size-3.5 shrink-0 opacity-80" aria-hidden />
                ) : undefined
              }
            />
            {open ? (
              <div className={cn('mt-1 space-y-0.5', compact ? 'ps-0.5' : 'ps-1')} role="group" aria-label={ts(section.titleKey)}>
                {section.items.map((m) => {
                  const Icon = moduleIcon(m.icon);
                  const isActive = isNavPathActive(pathname, m.sidebar_path);
                  return (
                    <Link
                      key={m.key}
                      href={m.sidebar_path}
                      scroll={false}
                      className={navLinkClass(isActive, compact)}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={onNavigate}
                    >
                      <Icon className={cn('shrink-0 opacity-90', compact ? 'size-4' : 'size-[1.125rem]')} aria-hidden />
                      <span className="min-w-0 truncate">{moduleLabel(m.key, m.name)}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function AdminSidebarNav({
  sections,
  onNavigate,
  compact = true,
}: {
  sections: { titleKey: string; items: AdminNavItem[] }[];
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const ts = useTranslations('sidebar');

  const activeSectionKey = useMemo(() => {
    for (const section of sections) {
      if (section.items.some((item) => isAdminNavActive(pathname, item.href))) return section.titleKey;
    }
    return null;
  }, [sections, pathname]);

  const { isOpen, toggle } = useSectionCollapse(activeSectionKey);

  return (
    <div className={cn('space-y-3', !compact && 'space-y-4')}>
      {sections.map((section) => {
        const open = isOpen(section.titleKey);
        const hasActive = section.titleKey === activeSectionKey;
        return (
          <div key={section.titleKey} className="min-w-0">
            <SectionHeading
              title={ts(section.titleKey)}
              open={open}
              onToggle={() => toggle(section.titleKey)}
              hasActive={hasActive}
            />
            {open ? (
              <div className={cn('mt-1 space-y-0.5', compact ? 'ps-0.5' : 'ps-1')} role="group" aria-label={ts(section.titleKey)}>
                {section.items.map(({ href, labelKey, icon: Icon }) => {
                  const isActive = isAdminNavActive(pathname, href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      scroll={false}
                      className={navLinkClass(isActive, compact)}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={onNavigate}
                    >
                      <Icon className={cn('shrink-0 opacity-90', compact ? 'size-4' : 'size-[1.125rem]')} aria-hidden />
                      <span className="min-w-0 truncate">{ts(labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
