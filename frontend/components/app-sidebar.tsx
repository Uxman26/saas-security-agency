'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { can, PERMS } from '@/lib/permissions';
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
import { CompanyBrand } from '@/components/company-brand';
import { cn } from '@/lib/utils';
import { sidebarPathAllowed } from '@/lib/sidebar-modules';

const items: { href: string; label: string; perm: string; icon: typeof Users }[] = [
  { href: '/dashboard', label: 'Dashboard', perm: 'guards.read', icon: LayoutDashboard },
  { href: '/guards', label: 'Staff', perm: 'guards.read', icon: Users },
  { href: '/sites', label: 'Sites', perm: 'sites.read', icon: MapPin },
  { href: '/clients', label: 'Clients', perm: 'clients.read', icon: Building2 },
  { href: '/assignments', label: 'Assignments', perm: 'assign.read', icon: ClipboardList },
  { href: '/rota', label: 'Rotas & Shifts', perm: 'assign.read', icon: Calendar },
  { href: '/client-portal', label: 'Client portal', perm: 'staff_req.write', icon: Building2 },
  { href: '/requests', label: 'Staff requests', perm: 'staff_req.review', icon: ClipboardList },
  { href: '/attendance', label: 'Attendance', perm: 'attend.read', icon: Clock },
  { href: '/documents', label: 'Documents', perm: 'doc.read', icon: FolderOpen },
  { href: '/contractors', label: 'Contractors', perm: PERMS.contractorView, icon: UserCog },
  { href: '/payroll', label: 'Payroll', perm: 'payroll.read', icon: PoundSterling },
  { href: '/invoices', label: 'Invoices', perm: 'inv.read', icon: FileText },
  { href: '/payments', label: 'Payments', perm: 'pay.read', icon: CreditCard },
  { href: '/allowances', label: 'Allowances', perm: 'allow.read', icon: Gift },
  { href: '/settings/special-days', label: 'Special days', perm: 'allow.read', icon: Calendar },
  { href: '/settings/company', label: 'Company', perm: 'sub.read', icon: Building2 },
  { href: '/settings/roles', label: 'Roles', perm: 'roles.read', icon: Shield },
];

function active(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/rota') return pathname.startsWith('/rota');
  if (href === '/client-portal') return pathname.startsWith('/client-portal');
  return pathname === href;
}

export function AppSidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const isSuperAdmin = user?.role === 'super_admin';
  const links = useMemo(() => {
    const showDirectory =
      can(user, PERMS.contractorView) /* &&
      (user?.plan?.features?.contractors === true || isTenantAdmin(user)) */;
    return items.filter((i) => {
      if (!sidebarPathAllowed(user?.sidebar_modules, i.href)) return false;
      if (i.href === '/contractors') return showDirectory;
      return can(user, i.perm);
    });
  }, [user]);

  if (isSuperAdmin) {
    return (
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r bg-slate-900 text-slate-100">
        <div className="p-4 border-b border-slate-700/80">
          <CompanyBrand />
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {[
            { href: '/admin/companies', label: 'Companies', icon: Building2 },
            { href: '/admin/receipts', label: 'Receipts', icon: CreditCard },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                pathname === href || pathname.startsWith(`${href}/`)
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-300 hover:bg-slate-800/80'
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
    );
  }

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r bg-slate-900 text-slate-100">
      <div className="p-4 border-b border-slate-700/80">
        <CompanyBrand />
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
