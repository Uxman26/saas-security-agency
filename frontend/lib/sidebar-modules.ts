export const ALL_SIDEBAR_PATHS = [
  '/dashboard',
  '/guards',
  '/sites',
  '/clients',
  '/leads',
  '/assignments',
  '/rota',
  '/attendance',
  '/documents',
  '/contractors',
  '/payroll',
  '/reports',
  '/invoices',
  '/expenses',
  '/payments',
  '/allowances',
  '/settings/special-days',
  '/settings/roles',
  '/settings/company',
  '/settings/sms',
  '/settings/email',
  '/client-portal',
  '/client-portal/request-staff',
  '/requests',
] as const;

export const SIDEBAR_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/guards': 'Staff',
  '/sites': 'Sites',
  '/clients': 'Clients',
  '/leads': 'Leads',
  '/assignments': 'Assignments',
  '/rota': 'Rotas & Shifts',
  '/attendance': 'Attendance',
  '/documents': 'Documents',
  '/contractors': 'Contractors',
  '/payroll': 'Payroll',
  '/reports': 'Reports',
  '/invoices': 'Invoices',
  '/expenses': 'Expenses',
  '/payments': 'Payments',
  '/allowances': 'Allowances',
  '/settings/special-days': 'Special days',
  '/settings/roles': 'Roles',
  '/settings/company': 'Company',
  '/settings/sms': 'SMS',
  '/settings/email': 'Email',
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

export function parseEmailVerificationRequired(err: unknown): { email?: string; receipt_ref?: string } | null {
  if (!(err instanceof Error)) return null;
  try {
    const d = JSON.parse(err.message);
    if (d?.code === 'email_verification_required') return d;
  } catch {
    return null;
  }
  return null;
}
