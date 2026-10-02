import { useTranslations } from 'next-intl';

/** Map AppModule.key → sidebar.* message key (camelCase where needed). */
export const MODULE_MESSAGE_KEYS: Record<string, string> = {
  dashboard: 'dashboard',
  guards: 'staff',
  contractors: 'contractors',
  sub_contractors: 'subContractors',
  attendance: 'attendance',
  absence: 'absence',
  staff_requests: 'staffRequests',
  documents: 'documents',
  rota: 'rota',
  rota_payable: 'rotaPayable',
  assignments: 'assignments',
  special_days: 'specialDays',
  sites: 'sites',
  patrol: 'patrol',
  lone_worker: 'loneWorker',
  my_portal: 'myPortal',
  tasks: 'tasks',
  incidents: 'incidents',
  accident_reports: 'accidentReports',
  occurrence_sheets: 'occurrenceSheets',
  roles: 'roles',
  clients: 'clients',
  client_portal: 'clientPortal',
  leads: 'leads',
  payroll: 'payroll',
  invoices: 'invoices',
  payments: 'payments',
  statements: 'statements',
  custom_invoices: 'customInvoices',
  expenses: 'expenses',
  allowances: 'allowances',
  vendors: 'vendors',
  fixed_expenses: 'fixedExpenses',
  recurring_invoices: 'recurringInvoices',
  chart_of_accounts: 'chartOfAccounts',
  reports: 'reports',
  company: 'company',
  billing: 'billing',
  sms: 'sms',
  email_settings: 'email',
  recycle_bin: 'recycleBin',
};

export function useModuleLabel() {
  const ts = useTranslations('sidebar');
  return (moduleKey: string, fallback?: string) => {
    const msgKey = MODULE_MESSAGE_KEYS[moduleKey];
    if (msgKey && ts.has(msgKey)) return ts(msgKey as Parameters<typeof ts>[0]);
    return fallback || moduleKey;
  };
}
