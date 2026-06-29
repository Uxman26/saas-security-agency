'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
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
  MessageSquare,
  Receipt,
  Wallet,
  Mail,
  Target,
} from 'lucide-react';
import { CompanyBrand } from '@/components/company-brand';
import { cn } from '@/lib/utils';
import { sidebarPathAllowed } from '@/lib/sidebar-modules';

const items: { href: string; labelKey: string; perm: string; icon: typeof Users }[] = [
  { href: '/dashboard', labelKey: 'dashboard', perm: 'guards.read', icon: LayoutDashboard },
  { href: '/guards', labelKey: 'staff', perm: 'guards.read', icon: Users },
  { href: '/sites', labelKey: 'sites', perm: 'sites.read', icon: MapPin },
  { href: '/clients', labelKey: 'clients', perm: 'clients.read', icon: Building2 },
  { href: '/leads', labelKey: 'leads', perm: 'leads.read', icon: Target },
  { href: '/assignments', labelKey: 'assignments', perm: 'assign.read', icon: ClipboardList },
  { href: '/rota', labelKey: 'rota', perm: 'assign.read', icon: Calendar },
  { href: '/client-portal', labelKey: 'clientPortal', perm: 'staff_req.write', icon: Building2 },
  { href: '/requests', labelKey: 'staffRequests', perm: 'staff_req.review', icon: ClipboardList },
  { href: '/attendance', labelKey: 'attendance', perm: 'attend.read', icon: Clock },
  { href: '/documents', labelKey: 'documents', perm: 'doc.read', icon: FolderOpen },
  { href: '/contractors', labelKey: 'contractors', perm: PERMS.contractorView, icon: UserCog },
  { href: '/payroll', labelKey: 'payroll', perm: 'payroll.read', icon: PoundSterling },
  { href: '/reports', labelKey: 'reports', perm: 'rep.read', icon: ClipboardList },
  { href: '/invoices', labelKey: 'invoices', perm: 'inv.read', icon: FileText },
  { href: '/expenses', labelKey: 'expenses', perm: 'exp.read', icon: Receipt },
  { href: '/payments', labelKey: 'payments', perm: 'pay.read', icon: CreditCard },
  { href: '/allowances', labelKey: 'allowances', perm: 'allow.read', icon: Gift },
  { href: '/settings/special-days', labelKey: 'specialDays', perm: 'allow.read', icon: Calendar },
  { href: '/settings/company', labelKey: 'company', perm: 'sub.read', icon: Building2 },
  { href: '/settings/billing', labelKey: 'billing', perm: 'sub.read', icon: CreditCard },
  { href: '/settings/sms', labelKey: 'sms', perm: 'email.send', icon: MessageSquare },
  { href: '/settings/email', labelKey: 'email', perm: 'email.send', icon: Mail },
  { href: '/settings/roles', labelKey: 'roles', perm: 'roles.read', icon: Shield },
];

function active(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/rota') return pathname.startsWith('/rota');
  if (href === '/leads') return pathname.startsWith('/leads');
  if (href === '/client-portal') return pathname.startsWith('/client-portal');
  return pathname === href;
}

export function AppSidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const ts = useTranslations('sidebar');
  const isSuperAdmin = user?.role === 'super_admin';
  const links = useMemo(() => {
    const showDirectory =
      can(user, PERMS.contractorView) /* &&
      (user?.plan?.features?.contractors === true || isTenantAdmin(user)) */;
    return items.filter((i) => {
      if (!sidebarPathAllowed(user?.sidebar_modules, i.href)) return false;
      if (i.href === '/contractors') return showDirectory;
      if (i.href === '/expenses' && user?.enabled_modules && user.enabled_modules.expenses === false) return false;
      if (i.href === '/leads' && user?.enabled_modules && user.enabled_modules.leads === false) return false;
      if (i.href === '/settings/sms' && user?.enabled_modules && user.enabled_modules.whatsapp === false) return false;
      if (i.href === '/settings/email' && user?.enabled_modules && user.enabled_modules.email === false) return false;
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
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                pathname === href || pathname.startsWith(`${href}/`)
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-300 hover:bg-slate-800/80'
              )}
            >
              <Icon className="size-4 shrink-0" />
              {ts(labelKey)}
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
        {links.map(({ href, labelKey, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              active(pathname, href) ? 'bg-slate-800 text-white font-medium' : 'text-slate-300 hover:bg-slate-800/80'
            )}
          >
            <Icon className="size-4 shrink-0 opacity-90" />
            {ts(labelKey)}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
