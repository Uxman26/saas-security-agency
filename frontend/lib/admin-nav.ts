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
  Hourglass,
  KeyRound,
  LayoutDashboard,
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
  Webhook,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavItem = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  perms?: readonly string[];
};

export type AdminNavSection = {
  titleKey: string;
  items: readonly AdminNavItem[];
};

export const ADMIN_NAV_SECTIONS: readonly AdminNavSection[] = [
  {
    titleKey: 'adminSectionHq',
    items: [
      { href: '/admin', labelKey: 'adminHq', icon: LayoutDashboard, perms: ['tenants.read', 'billing.read', 'ops.read'] },
      { href: '/admin/search', labelKey: 'adminSearch', icon: Search, perms: ['tenants.read'] },
    ],
  },
  {
    titleKey: 'adminSectionTenants',
    items: [{ href: '/admin/companies', labelKey: 'adminCompanies', icon: Building2, perms: ['tenants.read'] }],
  },
  {
    titleKey: 'adminSectionPeople',
    items: [
      { href: '/admin/users', labelKey: 'adminUsers', icon: Users, perms: ['tenants.read'] },
      { href: '/admin/admins', labelKey: 'adminAdmins', icon: UserCog, perms: ['tenants.read'] },
      { href: '/admin/roles', labelKey: 'adminRoles', icon: KeyRound, perms: ['config.read'] },
    ],
  },
  {
    titleKey: 'adminSectionPlans',
    items: [
      { href: '/admin/packages', labelKey: 'adminPackages', icon: Gift, perms: ['billing.read', 'config.read'] },
      { href: '/admin/trials', labelKey: 'adminTrials', icon: Hourglass, perms: ['trials.read', 'billing.read'] },
    ],
  },
  {
    titleKey: 'adminSectionBilling',
    items: [
      { href: '/admin/invoices', labelKey: 'adminInvoices', icon: FileText, perms: ['billing.read'] },
      { href: '/admin/payments', labelKey: 'adminPayments', icon: CreditCard, perms: ['billing.read'] },
      { href: '/admin/receipts', labelKey: 'adminReceipts', icon: Wallet, perms: ['billing.read'] },
      { href: '/admin/refunds', labelKey: 'adminRefunds', icon: RotateCcw, perms: ['refunds.read', 'billing.read'] },
    ],
  },
  {
    titleKey: 'adminSectionEmail',
    items: [
      { href: '/admin/email', labelKey: 'adminSmtp', icon: Mail, perms: ['config.read'] },
      { href: '/admin/templates', labelKey: 'adminTemplates', icon: Mail, perms: ['config.read'] },
    ],
  },
  {
    titleKey: 'adminSectionReports',
    items: [
      { href: '/admin/reports', labelKey: 'adminReports', icon: BarChart3, perms: ['tenants.read', 'billing.read', 'ops.read'] },
      { href: '/admin/api-usage', labelKey: 'adminApiUsage', icon: Activity, perms: ['ops.read'] },
    ],
  },
  {
    titleKey: 'adminSectionLogs',
    items: [
      { href: '/admin/logs', labelKey: 'adminLogs', icon: Clock, perms: ['audit.read', 'security.read'] },
      { href: '/admin/audit', labelKey: 'adminAudit', icon: ScrollText, perms: ['audit.read'] },
      { href: '/admin/errors', labelKey: 'adminErrors', icon: AlertTriangle, perms: ['ops.read'] },
      { href: '/admin/sessions', labelKey: 'adminSessions', icon: Monitor, perms: ['security.read'] },
      { href: '/admin/jobs', labelKey: 'adminJobs', icon: Cog, perms: ['ops.read'] },
      { href: '/admin/webhooks', labelKey: 'adminWebhooks', icon: Webhook, perms: ['ops.read'] },
    ],
  },
  {
    titleKey: 'adminSectionSettings',
    items: [
      { href: '/admin/flags', labelKey: 'adminFlags', icon: Flag, perms: ['config.read'] },
      { href: '/admin/security', labelKey: 'adminSecurity', icon: Shield, perms: ['security.read'] },
      { href: '/admin/compliance', labelKey: 'adminCompliance', icon: Scale, perms: ['config.read', 'security.read'] },
    ],
  },
  {
    titleKey: 'adminSectionSupport',
    items: [{ href: '/admin/tickets', labelKey: 'adminTickets', icon: LifeBuoy, perms: ['support.read'] }],
  },
] as const;

export const ADMIN_NAV: readonly AdminNavItem[] = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);

export function isAdminNavActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function filterAdminNavSections(can: (...codes: string[]) => boolean) {
  return ADMIN_NAV_SECTIONS.map((section) => ({
    titleKey: section.titleKey,
    items: section.items.filter((item) => !item.perms?.length || can(...item.perms)),
  })).filter((section) => section.items.length > 0);
}
