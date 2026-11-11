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
    'relative flex items-center gap-2.5 rounded-lg transition-colors outline-none',
    'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar',
    compact ? 'px-2.5 py-2 text-[15px] leading-5' : 'px-3 py-2.5 text-[15px] leading-5',
    isActive
      ? 'bg-sidebar-accent font-semibold text-sidebar-primary before:absolute before:inset-y-1.5 before:start-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary'
      : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
  );
}

function CountBadge({ value }: { value?: number }) {
  if (!value) return null;
  return (
    <span className="ms-auto shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-300">
      {value > 99 ? '99+' : value}
    </span>
  );
}

type RailItem = { key: string; href: string; label: string; icon: LucideIcon; active: boolean; badge?: number };

function RailNav({ groups, onNavigate }: { groups: { key: string; label: string; items: RailItem[] }[]; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {groups.map((g, gi) => (
        <div key={g.key} role="group" aria-label={g.label} className="flex w-full flex-col items-center gap-1">
          {gi ? <span aria-hidden className="my-1.5 h-px w-6 bg-sidebar-border" /> : null}
          {g.items.map(({ key, href, label, icon: Icon, active, badge }) => (
            <Link
              key={key}
              href={href}
              scroll={false}
              title={label}
              aria-label={badge ? `${label} (${badge})` : label}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                'relative flex size-10 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                active ? 'bg-sidebar-accent text-sidebar-primary' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
              )}
            >
              <Icon className="size-[1.125rem]" aria-hidden />
              {badge ? <span aria-hidden className="absolute end-1.5 top-1.5 size-2 rounded-full bg-amber-500 ring-2 ring-sidebar" /> : null}
            </Link>
          ))}
        </div>
      ))}
    </div>
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
        'group/sh flex w-full items-center gap-2 rounded-md px-2.5 pt-2 pb-1.5 text-start transition-colors',
        'text-[11px] font-semibold uppercase tracking-[0.08em]',
        'text-sidebar-foreground/55 hover:text-sidebar-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        hasActive && 'text-sidebar-foreground/80'
      )}
    >
      {leading}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <ChevronDown
        className={cn(
          'size-3.5 shrink-0 opacity-60 transition-[transform,opacity] duration-200 group-hover/sh:opacity-100',
          !open && '-rotate-90 rtl:rotate-90'
        )}
        aria-hidden
      />
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
  rail = false,
  badges,
}: {
  sections: { titleKey: string; items: ModuleAccess[] }[];
  onNavigate?: () => void;
  compact?: boolean;
  rail?: boolean;
  badges?: Record<string, number>;
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

  if (rail) {
    return (
      <RailNav
        onNavigate={onNavigate}
        groups={sections.map((section) => ({
          key: section.titleKey,
          label: ts(section.titleKey),
          items: section.items.map((m) => ({
            key: m.key,
            href: m.sidebar_path,
            label: moduleLabel(m.key, m.name),
            icon: moduleIcon(m.icon),
            active: isNavPathActive(pathname, m.sidebar_path),
            badge: badges?.[m.key],
          })),
        }))}
      />
    );
  }

  return (
    <div className={cn('space-y-2', !compact && 'space-y-3')}>
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
                      <Icon className={cn('shrink-0 opacity-90', compact ? 'size-[1.125rem]' : 'size-5')} aria-hidden />
                      <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">
                        {moduleLabel(m.key, m.name)}
                      </span>
                      <CountBadge value={badges?.[m.key]} />
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
  rail = false,
}: {
  sections: { titleKey: string; items: AdminNavItem[] }[];
  onNavigate?: () => void;
  compact?: boolean;
  rail?: boolean;
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

  if (rail) {
    return (
      <RailNav
        onNavigate={onNavigate}
        groups={sections.map((section) => ({
          key: section.titleKey,
          label: ts(section.titleKey),
          items: section.items.map((item) => ({
            key: item.href,
            href: item.href,
            label: ts(item.labelKey),
            icon: item.icon,
            active: isAdminNavActive(pathname, item.href),
          })),
        }))}
      />
    );
  }

  return (
    <div className={cn('space-y-2', !compact && 'space-y-3')}>
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
                      <Icon className={cn('shrink-0 opacity-90', compact ? 'size-[1.125rem]' : 'size-5')} aria-hidden />
                      <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">
                        {ts(labelKey)}
                      </span>
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
