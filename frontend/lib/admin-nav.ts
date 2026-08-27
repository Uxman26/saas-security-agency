import {
  Building2,
  Clock,
  CreditCard,
  FileText,
  Gift,
  Mail,
  ScrollText,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavItem = {
  href: string;
  /** Key under the `sidebar` namespace in messages/*.json */
  labelKey: string;
  icon: LucideIcon;
};

/**
 * The super admin portal's navigation, in one place.
 *
 * Both the desktop sidebar and the mobile drawer render from this list. They used to
 * carry their own hardcoded copies, so every new admin page had to be added twice and
 * the two drifted apart.
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: '/admin/companies', labelKey: 'adminCompanies', icon: Building2 },
  { href: '/admin/users', labelKey: 'adminUsers', icon: Users },
  { href: '/admin/admins', labelKey: 'adminAdmins', icon: UserCog },
  { href: '/admin/invoices', labelKey: 'adminInvoices', icon: FileText },
  { href: '/admin/payments', labelKey: 'adminPayments', icon: CreditCard },
  { href: '/admin/receipts', labelKey: 'adminReceipts', icon: Wallet },
  { href: '/admin/packages', labelKey: 'adminPackages', icon: Gift },
  { href: '/admin/audit', labelKey: 'adminAudit', icon: ScrollText },
  { href: '/admin/email', labelKey: 'adminSmtp', icon: Mail },
  { href: '/admin/logs', labelKey: 'adminLogs', icon: Clock },
] as const;

/** True when `pathname` is this item's page or one nested under it. */
export function isAdminNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
