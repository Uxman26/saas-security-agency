export const ALL_SIDEBAR_PATHS = [
  '/dashboard',
  '/guards',
  '/sites',
  '/clients',
  '/assignments',
  '/rota',
  '/attendance',
  '/documents',
  '/contractors',
  '/payroll',
  '/invoices',
  '/expenses',
  '/payments',
  '/allowances',
  '/settings/special-days',
  '/settings/roles',
  '/settings/company',
  '/client-portal',
  '/client-portal/request-staff',
  '/requests',
] as const;

export const SIDEBAR_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/guards': 'Staff',
  '/sites': 'Sites',
  '/clients': 'Clients',
  '/assignments': 'Assignments',
  '/rota': 'Rotas & Shifts',
  '/attendance': 'Attendance',
  '/documents': 'Documents',
  '/contractors': 'Contractors',
  '/payroll': 'Payroll',
  '/invoices': 'Invoices',
  '/expenses': 'Expenses',
  '/payments': 'Payments',
  '/allowances': 'Allowances',
  '/settings/special-days': 'Special days',
  '/settings/roles': 'Roles',
  '/settings/company': 'Company',
  '/client-portal': 'Client portal',
  '/client-portal/request-staff': 'Request staff',
  '/requests': 'Staff requests',
};

export function sidebarPathAllowed(modules: string[] | null | undefined, href: string): boolean {
  if (href === '/dashboard') return true;
  if (!modules || modules.length === 0) return true;
  return modules.includes(href);
}

export function parsePaymentPending(err: unknown): import('./types').PaymentPendingDetail | null {
  if (!(err instanceof Error)) return null;
  try {
    const d = JSON.parse(err.message);
    if (d?.code === 'payment_pending') return d;
  } catch {
    return null;
  }
  return null;
}
