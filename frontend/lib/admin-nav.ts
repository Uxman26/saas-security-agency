import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  Clock,
  Cog,
  CreditCard,
  FileText,
  Flag,
  Gift,
  KeyRound,
  LifeBuoy,
  Mail,
  Monitor,
  RotateCcw,
  Scale,
  ScrollText,
  Search,
  Shield,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavItem = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
};

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: '/admin/companies', labelKey: 'adminCompanies', icon: Building2 },
  { href: '/admin/users', labelKey: 'adminUsers', icon: Users },
  { href: '/admin/admins', labelKey: 'adminAdmins', icon: UserCog },
  { href: '/admin/tickets', labelKey: 'adminTickets', icon: LifeBuoy },
  { href: '/admin/errors', labelKey: 'adminErrors', icon: AlertTriangle },
  { href: '/admin/sessions', labelKey: 'adminSessions', icon: Monitor },
  { href: '/admin/jobs', labelKey: 'adminJobs', icon: Cog },
  { href: '/admin/reports', labelKey: 'adminReports', icon: BarChart3 },
  { href: '/admin/search', labelKey: 'adminSearch', icon: Search },
  { href: '/admin/flags', labelKey: 'adminFlags', icon: Flag },
  { href: '/admin/security', labelKey: 'adminSecurity', icon: Shield },
  { href: '/admin/compliance', labelKey: 'adminCompliance', icon: Scale },
  { href: '/admin/api-usage', labelKey: 'adminApiUsage', icon: Activity },
  { href: '/admin/templates', labelKey: 'adminTemplates', icon: Mail },
  { href: '/admin/refunds', labelKey: 'adminRefunds', icon: RotateCcw },
  { href: '/admin/roles', labelKey: 'adminRoles', icon: KeyRound },
  { href: '/admin/invoices', labelKey: 'adminInvoices', icon: FileText },
  { href: '/admin/payments', labelKey: 'adminPayments', icon: CreditCard },
  { href: '/admin/receipts', labelKey: 'adminReceipts', icon: Wallet },
  { href: '/admin/packages', labelKey: 'adminPackages', icon: Gift },
  { href: '/admin/audit', labelKey: 'adminAudit', icon: ScrollText },
  { href: '/admin/email', labelKey: 'adminSmtp', icon: Mail },
  { href: '/admin/logs', labelKey: 'adminLogs', icon: Clock },
] as const;

export function isAdminNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
