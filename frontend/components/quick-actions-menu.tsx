'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  CalendarPlus,
  ClipboardPlus,
  FilePlus,
  LayoutDashboard,
  Plus,
  UserPlus,
  Users,
  Building2,
  MapPin,
  Receipt,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
import { moduleNavAllowed } from '@/lib/nav-modules';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type QuickActionDef = {
  id: string;
  labelKey: string;
  href: string;
  moduleKey: string;
  action: 'view' | 'create' | 'edit';
  icon: typeof Plus;
  roles?: Array<'super_admin' | 'tenant' | 'staff' | 'client'>;
};

const ACTIONS: QuickActionDef[] = [
  {
    id: 'dashboard',
    labelKey: 'dashboard',
    href: '/dashboard',
    moduleKey: 'dashboard',
    action: 'view',
    icon: LayoutDashboard,
    roles: ['tenant', 'staff', 'client'],
  },
  {
    id: 'newRota',
    labelKey: 'newRota',
    href: '/rota/create',
    moduleKey: 'rota',
    action: 'create',
    icon: CalendarPlus,
    roles: ['tenant'],
  },
  {
    id: 'openRota',
    labelKey: 'openRota',
    href: '/rota',
    moduleKey: 'rota',
    action: 'view',
    icon: CalendarPlus,
    roles: ['tenant', 'staff'],
  },
  {
    id: 'newStaff',
    labelKey: 'newStaff',
    href: '/guards?new=1',
    moduleKey: 'guards',
    action: 'create',
    icon: UserPlus,
    roles: ['tenant'],
  },
  {
    id: 'staff',
    labelKey: 'staff',
    href: '/guards',
    moduleKey: 'guards',
    action: 'view',
    icon: Users,
    roles: ['tenant'],
  },
  {
    id: 'newClient',
    labelKey: 'newClient',
    href: '/clients?new=1',
    moduleKey: 'clients',
    action: 'create',
    icon: Building2,
    roles: ['tenant'],
  },
  {
    id: 'sites',
    labelKey: 'sites',
    href: '/sites',
    moduleKey: 'sites',
    action: 'view',
    icon: MapPin,
    roles: ['tenant', 'staff', 'client'],
  },
  {
    id: 'attendance',
    labelKey: 'attendance',
    href: '/attendance',
    moduleKey: 'attendance',
    action: 'view',
    icon: ClipboardPlus,
    roles: ['tenant', 'staff'],
  },
  {
    id: 'newInvoice',
    labelKey: 'newInvoice',
    href: '/invoices',
    moduleKey: 'invoices',
    action: 'create',
    icon: FilePlus,
    roles: ['tenant'],
  },
  {
    id: 'payroll',
    labelKey: 'payroll',
    href: '/payroll',
    moduleKey: 'payroll',
    action: 'view',
    icon: Receipt,
    roles: ['tenant'],
  },
  {
    id: 'tasks',
    labelKey: 'tasks',
    href: '/tasks',
    moduleKey: 'tasks',
    action: 'view',
    icon: ClipboardPlus,
    roles: ['tenant', 'staff'],
  },
  {
    id: 'adminHq',
    labelKey: 'adminHq',
    href: '/admin',
    moduleKey: 'dashboard',
    action: 'view',
    icon: LayoutDashboard,
    roles: ['super_admin'],
  },
  {
    id: 'adminTenants',
    labelKey: 'adminTenants',
    href: '/admin/companies',
    moduleKey: 'dashboard',
    action: 'view',
    icon: Building2,
    roles: ['super_admin'],
  },
  {
    id: 'adminLiveSupport',
    labelKey: 'adminLiveSupport',
    href: '/admin/live-support',
    moduleKey: 'dashboard',
    action: 'view',
    icon: ClipboardPlus,
    roles: ['super_admin'],
  },
];

function roleBucket(role?: string): 'super_admin' | 'tenant' | 'staff' | 'client' {
  const r = (role || '').toLowerCase();
  if (r === 'super_admin') return 'super_admin';
  if (r === 'staff') return 'staff';
  if (r === 'client') return 'client';
  return 'tenant';
}

export function QuickActionsMenu() {
  const { user } = useAuth();
  const t = useTranslations('quickActions');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    if (!user) return [];
    const bucket = roleBucket(user.role);
    return ACTIONS.filter((a) => {
      if (a.roles && !a.roles.includes(bucket)) return false;
      if (bucket === 'super_admin') return true;
      if (!canModule(user, a.moduleKey, a.action)) return false;
      const mod = user.module_access?.find((m) => m.key === a.moduleKey);
      if (mod && !moduleNavAllowed(user, mod) && a.action === 'view') {
        // Still allow create shortcuts if create is granted even when nav hidden is rare
      }
      if (a.action === 'view' && mod && !moduleNavAllowed(user, mod)) return false;
      return true;
    });
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user || items.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 px-2.5 sm:px-3"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('title')}
        title={t('title')}
        onClick={() => setOpen((v) => !v)}
      >
        <Zap className="size-4 shrink-0" />
        <span className="hidden sm:inline">{t('title')}</span>
      </Button>
      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute end-0 top-full z-50 mt-1.5 w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg'
          )}
        >
          <div className="border-b bg-muted/40 px-3 py-2">
            <p className="text-xs font-semibold">{t('title')}</p>
            <p className="text-[10px] text-muted-foreground">{t('subtitle')}</p>
          </div>
          <ul className="max-h-[min(24rem,60vh)] overflow-y-auto py-1">
            {items.map((a) => {
              const Icon = a.icon;
              return (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => setOpen(false)}
                  >
                    <Icon className="size-4 shrink-0 text-orange-600" />
                    <span className="truncate">{t(a.labelKey as Parameters<typeof t>[0])}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">{tc('rbacScoped')}</div>
        </div>
      ) : null}
    </div>
  );
}
