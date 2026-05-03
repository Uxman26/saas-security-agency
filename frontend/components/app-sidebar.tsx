'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import {
  Building2,
  Calendar,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  FolderOpen,
  Gift,
  LayoutDashboard,
  MapPin,
  PoundSterling,
  Shield,
  UserCog,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const items: { href: string; label: string; perm: string; icon: typeof Users }[] = [
  { href: '/dashboard', label: 'Dashboard', perm: 'guards.read', icon: LayoutDashboard },
  { href: '/guards', label: 'Guards', perm: 'guards.read', icon: Users },
  { href: '/sites', label: 'Sites', perm: 'sites.read', icon: MapPin },
  { href: '/clients', label: 'Clients', perm: 'clients.read', icon: Building2 },
  { href: '/assignments', label: 'Assignments', perm: 'assign.read', icon: ClipboardList },
  { href: '/rota', label: 'Rotas & Shifts', perm: 'assign.read', icon: Calendar },
  { href: '/attendance', label: 'Attendance', perm: 'attend.read', icon: Clock },
  { href: '/documents', label: 'Documents', perm: 'doc.read', icon: FolderOpen },
  { href: '/contractors', label: 'Contractors', perm: 'subs.read', icon: UserCog },
  { href: '/payroll', label: 'Payroll', perm: 'payroll.read', icon: PoundSterling },
  { href: '/invoices', label: 'Invoices', perm: 'inv.read', icon: FileText },
  { href: '/payments', label: 'Payments', perm: 'pay.read', icon: CreditCard },
  { href: '/allowances', label: 'Allowances', perm: 'allow.read', icon: Gift },
  { href: '/settings/special-days', label: 'Special days', perm: 'allow.read', icon: Calendar },
  { href: '/settings/roles', label: 'Roles', perm: 'roles.read', icon: Shield },
];

function active(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/rota') return pathname.startsWith('/rota');
  return pathname === href;
}

export function AppSidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const isSuperAdmin = user?.role === 'super_admin';
  const links = useMemo(() => {
    const showSubs = can(user, 'subs.read') && user?.plan?.features?.subcontractors === true;
    return items.filter((i) => {
      if (i.href === '/contractors') return showSubs;
      return can(user, i.perm);
    });
  }, [user]);

  if (isSuperAdmin) {
    return (
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r bg-slate-900 text-slate-100">
        <div className="p-4 border-b border-slate-700/80">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-white">
            <Shield className="size-5 text-sky-400" />
            <span className="truncate">SecureForce</span>
          </Link>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          <Link
            href="/admin/companies"
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              pathname === '/admin/companies' ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/80'
            )}
          >
            <Building2 className="size-4 shrink-0" />
            Companies
          </Link>
        </nav>
      </aside>
    );
  }

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r bg-slate-900 text-slate-100">
      <div className="p-4 border-b border-slate-700/80">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-white">
          <Shield className="size-5 text-sky-400" />
          <span className="truncate">SecureForce</span>
        </Link>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              active(pathname, href) ? 'bg-slate-800 text-white font-medium' : 'text-slate-300 hover:bg-slate-800/80'
            )}
          >
            <Icon className="size-4 shrink-0 opacity-90" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
