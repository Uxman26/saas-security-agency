import type { User, Guard, Site, Assignment, Rota, RotaDetail, RotaSummary, RotaPlanListItem, RotaPlanDetail, RotaPlanPublishResult, LoginResponse, Client, MainContractor, SubContractor, DashboardOverview, ComplianceAlert, ContractExpiryAlert, ClientContractRenewal, Payroll, Invoice, Allowance, GuardDocument, Attendance, Payment, GuardRate, SiteRate, Role, CompanyUser, PermissionMatrix, SpecialDay, DirectoryContractor, DirectoryContractorList, DirectoryContractorAssignment, SignupResponse, SubscriptionReceipt, ReceiptPublic, AdminUserDetail } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const raw = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const token = raw ? raw.trim() : null;
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
  });

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Unauthorized');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    const d = error.detail;
    if (response.status === 402 && d && typeof d === 'object' && d.code === 'payment_pending') {
      throw new ApiError(402, JSON.stringify(d));
    }
    const msg = Array.isArray(d)
      ? d.map((x: { msg?: string }) => x.msg).filter(Boolean).join('; ') || 'Request failed'
      : typeof d === 'string'
        ? d
        : 'Request failed';
    throw new ApiError(response.status, msg);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

async function requestBlob(endpoint: string): Promise<Blob> {
  const raw = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const token = raw ? raw.trim() : null;
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Unauthorized');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    const d = error.detail;
    const msg = Array.isArray(d)
      ? d.map((x: { msg?: string }) => x.msg).filter(Boolean).join('; ') || 'Request failed'
      : typeof d === 'string'
        ? d
        : 'Request failed';
    throw new ApiError(response.status, msg);
  }
  return response.blob();
}

function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

export const api = {
  auth: {
    signup: (data: { email: string; password: string; full_name: string; company_name: string; subscription_tier?: string }): Promise<SignupResponse> => {
      const sanitized = {
        email: sanitizeInput(data.email),
        password: data.password,
        full_name: sanitizeInput(data.full_name),
        company_name: sanitizeInput(data.company_name),
        ...(data.subscription_tier && { subscription_tier: sanitizeInput(data.subscription_tier) }),
      };
      return request<SignupResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(sanitized) });
    },
    login: (data: { email: string; password: string }): Promise<LoginResponse> => {
      const sanitized = {
        email: sanitizeInput(data.email),
        password: data.password,
      };
      return request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(sanitized) });
    },
    me: (): Promise<User> => request<User>('/auth/me'),
  },
  guards: {
    list: (params?: { area?: string; postcode?: string; nearby?: string }): Promise<Guard[]> => {
      const q = new URLSearchParams();
      if (params?.area) q.append('area', params.area);
      if (params?.postcode) q.append('postcode', params.postcode);
      if (params?.nearby) q.append('nearby', params.nearby);
      const qs = q.toString();
      return request<Guard[]>(`/guards${qs ? `?${qs}` : ''}`);
    },
    get: (id: number): Promise<Guard> => request<Guard>(`/guards/${id}`),
    create: (data: Omit<Guard, 'id' | 'company_id' | 'created_at'>): Promise<Guard> => {
      const sanitized = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? sanitizeInput(v) : v])
      );
      return request<Guard>('/guards', { method: 'POST', body: JSON.stringify(sanitized) });
    },
    update: (id: number, data: Partial<Omit<Guard, 'id' | 'company_id' | 'created_at'>>): Promise<Guard> => {
      const sanitized = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? sanitizeInput(v) : v])
      );
      return request<Guard>(`/guards/${id}`, { method: 'PUT', body: JSON.stringify(sanitized) });
    },
    delete: (id: number): Promise<void> => request<void>(`/guards/${id}`, { method: 'DELETE' }),
  },
  sites: {
    list: (): Promise<Site[]> => request<Site[]>('/sites'),
    get: (id: number): Promise<Site> => request<Site>(`/sites/${id}`),
    create: (data: Omit<Site, 'id' | 'company_id' | 'created_at'>): Promise<Site> => {
      const sanitized = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? sanitizeInput(v) : v])
      );
      return request<Site>('/sites', { method: 'POST', body: JSON.stringify(sanitized) });
    },
    update: (id: number, data: Partial<Omit<Site, 'id' | 'company_id' | 'created_at'>>): Promise<Site> => {
      const sanitized = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? sanitizeInput(v) : v])
      );
      return request<Site>(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(sanitized) });
    },
    delete: (id: number): Promise<void> => request<void>(`/sites/${id}`, { method: 'DELETE' }),
  },
  assignments: {
    list: (params?: { guard_id?: number; site_id?: number; client_id?: number; start_date?: string; end_date?: string }): Promise<Assignment[]> => {
      const query = new URLSearchParams();
      if (params?.guard_id) query.append('guard_id', params.guard_id.toString());
      if (params?.site_id) query.append('site_id', params.site_id.toString());
      if (params?.client_id) query.append('client_id', params.client_id.toString());
      if (params?.start_date) query.append('start_date', params.start_date);
      if (params?.end_date) query.append('end_date', params.end_date);
      return request<Assignment[]>(`/assignments?${query.toString()}`);
    },
    rota: (params?: { start_date?: string; end_date?: string; guard_id?: number; site_id?: number; client_id?: number }): Promise<Rota[]> => {
      const query = new URLSearchParams();
      if (params?.start_date) query.append('start_date', params.start_date);
      if (params?.end_date) query.append('end_date', params.end_date);
      if (params?.guard_id) query.append('guard_id', params.guard_id.toString());
      if (params?.site_id) query.append('site_id', params.site_id.toString());
      if (params?.client_id) query.append('client_id', params.client_id.toString());
      return request<Rota[]>(`/assignments/rota?${query.toString()}`);
    },
    rotaDetail: (params: { start_date: string; end_date: string; guard_id?: number; site_id?: number; client_id?: number }): Promise<RotaDetail[]> => {
      const query = new URLSearchParams();
      query.append('start_date', params.start_date);
      query.append('end_date', params.end_date);
      if (params.guard_id) query.append('guard_id', params.guard_id.toString());
      if (params.site_id) query.append('site_id', params.site_id.toString());
      if (params.client_id) query.append('client_id', params.client_id.toString());
      return request<RotaDetail[]>(`/assignments/rota/detail?${query.toString()}`);
    },
    rotaSummary: (params: { start_date: string; end_date: string; guard_id?: number; site_id?: number; client_id?: number }): Promise<RotaSummary[]> => {
      const query = new URLSearchParams();
      query.append('start_date', params.start_date);
      query.append('end_date', params.end_date);
      if (params.guard_id) query.append('guard_id', params.guard_id.toString());
      if (params.site_id) query.append('site_id', params.site_id.toString());
      if (params.client_id) query.append('client_id', params.client_id.toString());
      return request<RotaSummary[]>(`/assignments/rota/summary?${query.toString()}`);
    },
    rotaExport: (params: { start_date: string; end_date: string; format?: 'xlsx' | 'pdf'; guard_id?: number; site_id?: number; client_id?: number }): Promise<Blob> => {
      const query = new URLSearchParams();
      query.append('start_date', params.start_date);
      query.append('end_date', params.end_date);
      query.append('format', params.format || 'xlsx');
      if (params.guard_id) query.append('guard_id', params.guard_id.toString());
      if (params.site_id) query.append('site_id', params.site_id.toString());
      if (params.client_id) query.append('client_id', params.client_id.toString());
      return requestBlob(`/assignments/rota/export?${query.toString()}`);
    },
    create: (data: Omit<Assignment, 'id' | 'created_at'>): Promise<Assignment> => {
      return request<Assignment>('/assignments', { method: 'POST', body: JSON.stringify(data) });
    },
    update: (id: number, data: Partial<Omit<Assignment, 'id' | 'created_at'>>): Promise<Assignment> => {
      return request<Assignment>(`/assignments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete: (id: number): Promise<void> => request<void>(`/assignments/${id}`, { method: 'DELETE' }),
  },
  rotaPlans: {
    list: (): Promise<RotaPlanListItem[]> => request<RotaPlanListItem[]>('/rotas'),
    get: (id: number): Promise<RotaPlanDetail> => request<RotaPlanDetail>(`/rotas/${id}`),
    create: (data: {
      name: string;
      start_date: string;
      day_count: number;
      view_mode: string;
      budget?: number;
      planner_data?: string;
    }): Promise<RotaPlanDetail> =>
      request<RotaPlanDetail>('/rotas', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: number,
      data: Partial<{ name: string; view_mode: string; budget: number; planner_data: string }>
    ): Promise<RotaPlanDetail> =>
      request<RotaPlanDetail>(`/rotas/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> => request<void>(`/rotas/${id}`, { method: 'DELETE' }),
    publish: (id: number): Promise<RotaPlanPublishResult> =>
      request<RotaPlanPublishResult>(`/rotas/${id}/publish`, { method: 'POST' }),
  },
  clients: {
    list: (): Promise<Client[]> => request<Client[]>('/clients'),
    get: (id: number): Promise<Client> => request<Client>(`/clients/${id}`),
    create: (data: Omit<Client, 'id' | 'company_id' | 'created_at'>): Promise<Client> => {
      const sanitized = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? sanitizeInput(v) : v])
      );
      return request<Client>('/clients', { method: 'POST', body: JSON.stringify(sanitized) });
    },
    update: (id: number, data: Partial<Omit<Client, 'id' | 'company_id' | 'created_at'>>): Promise<Client> => {
      const sanitized = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? sanitizeInput(v) : v])
      );
      return request<Client>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(sanitized) });
    },
    delete: (id: number): Promise<void> => request<void>(`/clients/${id}`, { method: 'DELETE' }),
    renew: (id: number, data: { new_end_date: string; note?: string }): Promise<ClientContractRenewal> =>
      request<ClientContractRenewal>(`/clients/${id}/renew`, { method: 'POST', body: JSON.stringify(data) }),
    renewals: (id: number): Promise<ClientContractRenewal[]> => request<ClientContractRenewal[]>(`/clients/${id}/renewals`),
  },
  mainContractors: {
    list: (): Promise<MainContractor[]> => request<MainContractor[]>('/main-contractors'),
    get: (id: number): Promise<MainContractor> => request<MainContractor>(`/main-contractors/${id}`),
    create: (data: Omit<MainContractor, 'id' | 'company_id' | 'created_at'>): Promise<MainContractor> => {
      const sanitized = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? sanitizeInput(v) : v])
      );
      return request<MainContractor>('/main-contractors', { method: 'POST', body: JSON.stringify(sanitized) });
    },
    update: (id: number, data: Partial<Omit<MainContractor, 'id' | 'company_id' | 'created_at'>>): Promise<MainContractor> => {
      const sanitized = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? sanitizeInput(v) : v])
      );
      return request<MainContractor>(`/main-contractors/${id}`, { method: 'PUT', body: JSON.stringify(sanitized) });
    },
    delete: (id: number): Promise<void> => request<void>(`/main-contractors/${id}`, { method: 'DELETE' }),
  },
  subContractors: {
    list: (mainContractorId?: number): Promise<SubContractor[]> => {
      const q = mainContractorId != null ? `?main_contractor_id=${mainContractorId}` : '';
      return request<SubContractor[]>(`/sub-contractors${q}`);
    },
    get: (id: number): Promise<SubContractor> => request<SubContractor>(`/sub-contractors/${id}`),
    create: (data: Omit<SubContractor, 'id' | 'company_id' | 'created_at'> & { main_contractor_id: number }): Promise<SubContractor> => {
      const sanitized = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? sanitizeInput(v) : v])
      );
      return request<SubContractor>('/sub-contractors', { method: 'POST', body: JSON.stringify(sanitized) });
    },
    update: (id: number, data: Partial<Omit<SubContractor, 'id' | 'company_id' | 'created_at'>>): Promise<SubContractor> => {
      const sanitized = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? sanitizeInput(v) : v])
      );
      return request<SubContractor>(`/sub-contractors/${id}`, { method: 'PUT', body: JSON.stringify(sanitized) });
    },
    delete: (id: number): Promise<void> => request<void>(`/sub-contractors/${id}`, { method: 'DELETE' }),
  },
  email: {
    send: (data: { to_email: string; subject: string; body: string }): Promise<{ message: string }> => {
      const sanitized = {
        to_email: sanitizeInput(data.to_email),
        subject: sanitizeInput(data.subject),
        body: data.body,
      };
      return request<{ message: string }>('/email/send', { method: 'POST', body: JSON.stringify(sanitized) });
    },
  },
  reports: {
    dashboard: (): Promise<DashboardOverview> => request<DashboardOverview>('/reports/dashboard'),
    compliance: (days?: number): Promise<ComplianceAlert[]> => request<ComplianceAlert[]>(`/reports/compliance${days != null ? `?days=${days}` : ''}`),
    contractsExpiring: (days?: number): Promise<ContractExpiryAlert[]> =>
      request<ContractExpiryAlert[]>(`/reports/contracts-expiring${days != null ? `?days=${days}` : ''}`),
  },
  payroll: {
    list: (params?: { guard_id?: number; period_start?: string; period_end?: string }): Promise<Payroll[]> => {
      const q = new URLSearchParams();
      if (params?.guard_id) q.append('guard_id', params.guard_id.toString());
      if (params?.period_start) q.append('period_start', params.period_start);
      if (params?.period_end) q.append('period_end', params.period_end);
      return request<Payroll[]>(`/payroll?${q.toString()}`);
    },
    get: (id: number): Promise<Payroll> => request<Payroll>(`/payroll/${id}`),
    create: (data: Partial<Payroll>): Promise<Payroll> => request<Payroll>('/payroll', { method: 'POST', body: JSON.stringify(data) }),
    calculate: (guard_id: number, period_start: string, period_end: string): Promise<Payroll> =>
      request<Payroll>(`/payroll/calculate?guard_id=${guard_id}&period_start=${period_start}&period_end=${period_end}`, { method: 'POST' }),
    delete: (id: number): Promise<void> => request<void>(`/payroll/${id}`, { method: 'DELETE' }),
  },
  invoices: {
    list: (params?: { client_id?: number; status?: string }): Promise<Invoice[]> => {
      const q = new URLSearchParams();
      if (params?.client_id) q.append('client_id', params.client_id.toString());
      if (params?.status) q.append('status', params.status);
      return request<Invoice[]>(`/invoices?${q.toString()}`);
    },
    get: (id: number): Promise<Invoice> => request<Invoice>(`/invoices/${id}`),
    pdf: (id: number): Promise<Blob> => requestBlob(`/invoices/${id}/pdf`),
    audit: (id: number): Promise<import('./types').InvoiceAuditEntry[]> =>
      request<import('./types').InvoiceAuditEntry[]>(`/invoices/${id}/audit`),
    patch: (
      id: number,
      data: { due_date?: string | null; notes?: string | null; tax_rate?: number; status?: string }
    ): Promise<Invoice> => request<Invoice>(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    updateLine: (
      invoiceId: number,
      lineId: number,
      data: {
        site_id?: number;
        guard_id?: number | null;
        hours?: number;
        rate?: number;
        allowance_amount?: number;
      }
    ): Promise<import('./types').InvoiceLine> =>
      request<import('./types').InvoiceLine>(`/invoices/${invoiceId}/lines/${lineId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteLine: (invoiceId: number, lineId: number): Promise<void> =>
      request<void>(`/invoices/${invoiceId}/lines/${lineId}`, { method: 'DELETE' }),
    create: (data: Partial<Invoice>): Promise<Invoice> => request<Invoice>('/invoices', { method: 'POST', body: JSON.stringify(data) }),
    generate: (client_id: number, period_start: string, period_end: string): Promise<Invoice> =>
      request<Invoice>(`/invoices/generate?client_id=${client_id}&period_start=${period_start}&period_end=${period_end}`, { method: 'POST' }),
    updateStatus: (id: number, status: string): Promise<Invoice> => request<Invoice>(`/invoices/${id}/status?status=${encodeURIComponent(status)}`, { method: 'PATCH' }),
    addLine: (
      invoiceId: number,
      data: { site_id: number; guard_id?: number; hours: number; rate: number; allowance_amount?: number }
    ): Promise<import('./types').InvoiceLine> =>
      request<import('./types').InvoiceLine>(`/invoices/${invoiceId}/lines`, { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> => request<void>(`/invoices/${id}`, { method: 'DELETE' }),
  },
  allowances: {
    list: (): Promise<Allowance[]> => request<Allowance[]>('/allowances'),
    get: (id: number): Promise<Allowance> => request<Allowance>(`/allowances/${id}`),
    create: (data: Omit<Allowance, 'id' | 'company_id' | 'created_at'>): Promise<Allowance> =>
      request<Allowance>('/allowances', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Omit<Allowance, 'id' | 'company_id' | 'created_at'>>): Promise<Allowance> =>
      request<Allowance>(`/allowances/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> => request<void>(`/allowances/${id}`, { method: 'DELETE' }),
  },
  specialDays: {
    list: (params?: { start_date?: string; end_date?: string }): Promise<SpecialDay[]> => {
      const q = new URLSearchParams();
      if (params?.start_date) q.append('start_date', params.start_date);
      if (params?.end_date) q.append('end_date', params.end_date);
      const qs = q.toString();
      return request<SpecialDay[]>(`/special-days${qs ? `?${qs}` : ''}`);
    },
    create: (data: { date: string; label: string }): Promise<SpecialDay> =>
      request<SpecialDay>('/special-days', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> => request<void>(`/special-days/${id}`, { method: 'DELETE' }),
    seedUk: (year: number): Promise<{ added: number; year: number }> =>
      request<{ added: number; year: number }>('/special-days/seed-uk', { method: 'POST', body: JSON.stringify({ year }) }),
  },
  receipts: {
    public: (refId: string): Promise<ReceiptPublic> =>
      request<ReceiptPublic>(`/receipts/public/${encodeURIComponent(refId)}`),
  },
  admin: {
    companies: (): Promise<import('./types').Company[]> => request<import('./types').Company[]>('/admin/companies'),
    receipts: (): Promise<SubscriptionReceipt[]> => request<SubscriptionReceipt[]>('/admin/receipts'),
    markReceiptPaid: (id: number): Promise<SubscriptionReceipt> =>
      request<SubscriptionReceipt>(`/admin/receipts/${id}/mark-paid`, { method: 'POST' }),
    admins: (): Promise<AdminUserDetail[]> => request<AdminUserDetail[]>('/admin/admins'),
    admin: (id: number): Promise<AdminUserDetail> => request<AdminUserDetail>(`/admin/admins/${id}`),
    patchSidebar: (id: number, sidebar_modules: string[]): Promise<AdminUserDetail> =>
      request<AdminUserDetail>(`/admin/admins/${id}/sidebar`, {
        method: 'PATCH',
        body: JSON.stringify({ sidebar_modules }),
      }),
    resetPassword: (id: number, new_password: string): Promise<AdminUserDetail> =>
      request<AdminUserDetail>(`/admin/admins/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password }),
      }),
  },
  roles: {
    list: (): Promise<Role[]> => request<Role[]>('/roles'),
    create: (data: { name: string; matrix: PermissionMatrix }): Promise<Role> =>
      request<Role>('/roles', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: { name?: string; matrix?: PermissionMatrix }): Promise<Role> =>
      request<Role>(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> => request<void>(`/roles/${id}`, { method: 'DELETE' }),
  },
  users: {
    list: (): Promise<CompanyUser[]> => request<CompanyUser[]>('/users'),
    patchRole: (userId: number, role_id: number): Promise<CompanyUser> =>
      request<CompanyUser>(`/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role_id }) }),
  },
  documents: {
    // Flat /documents endpoint — guard_id optional for filtering
    list: (guard_id?: number): Promise<GuardDocument[]> => {
      const q = new URLSearchParams();
      if (guard_id) q.append('guard_id', guard_id.toString());
      return request<GuardDocument[]>(`/documents?${q.toString()}`);
    },
    // guard_id is in the body via GuardDocumentCreateFlat
    create: (data: { guard_id: number; document_type: string; file_path?: string; expiry_date?: string }): Promise<GuardDocument> =>
      request<GuardDocument>('/documents', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> => request<void>(`/documents/${id}`, { method: 'DELETE' }),
  },
  attendance: {
    list: (params?: { guard_id?: number }): Promise<Attendance[]> => {
      const q = new URLSearchParams();
      if (params?.guard_id) q.append('guard_id', params.guard_id.toString());
      return request<Attendance[]>(`/attendance?${q.toString()}`);
    },
    // Backend BookingOnOff only accepts { assignment_id, book_off }
    bookOn: (assignment_id: number): Promise<Attendance> =>
      request<Attendance>('/attendance/book', { method: 'POST', body: JSON.stringify({ assignment_id, book_off: false }) }),
    bookOff: (assignment_id: number): Promise<Attendance> =>
      request<Attendance>('/attendance/book', { method: 'POST', body: JSON.stringify({ assignment_id, book_off: true }) }),
    late: (params?: { start_date?: string; end_date?: string }): Promise<Attendance[]> => {
      const q = new URLSearchParams();
      if (params?.start_date) q.append('start_date', params.start_date);
      if (params?.end_date) q.append('end_date', params.end_date);
      return request<Attendance[]>(`/attendance/late?${q.toString()}`);
    },
  },
  payments: {
    list: (params?: { invoice_id?: number }): Promise<Payment[]> => {
      const q = new URLSearchParams();
      if (params?.invoice_id) q.append('invoice_id', params.invoice_id.toString());
      return request<Payment[]>(`/payments?${q.toString()}`);
    },
    create: (data: { invoice_id?: number; amount: number; method: string; paid_at: string }): Promise<Payment> =>
      request<Payment>('/payments', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> => request<void>(`/payments/${id}`, { method: 'DELETE' }),
  },
  rates: {
    guardRates: (guard_id: number): Promise<GuardRate[]> => request<GuardRate[]>(`/rates/guards/${guard_id}`),
    createGuardRate: (guard_id: number, data: { hourly_rate: number; effective_from: string }): Promise<GuardRate> =>
      request<GuardRate>(`/rates/guards/${guard_id}`, { method: 'POST', body: JSON.stringify(data) }),
    deleteGuardRate: (guard_id: number, rate_id: number): Promise<void> =>
      request<void>(`/rates/guards/${guard_id}/${rate_id}`, { method: 'DELETE' }),
    siteRates: (site_id: number): Promise<SiteRate[]> => request<SiteRate[]>(`/rates/sites/${site_id}`),
    createSiteRate: (site_id: number, data: { shift_type: string; hourly_rate: number }): Promise<SiteRate> =>
      request<SiteRate>(`/rates/sites/${site_id}`, { method: 'POST', body: JSON.stringify(data) }),
    deleteSiteRate: (site_id: number, rate_id: number): Promise<void> =>
      request<void>(`/rates/sites/${site_id}/${rate_id}`, { method: 'DELETE' }),
  },
  directoryContractors: {
    getContractors: (params?: { type?: 'main' | 'sub'; is_active?: boolean }): Promise<DirectoryContractorList[]> => {
      const q = new URLSearchParams();
      if (params?.type) q.append('type', params.type);
      if (params?.is_active !== undefined) q.append('is_active', String(params.is_active));
      const qs = q.toString();
      return request<DirectoryContractorList[]>(`/contractors${qs ? `?${qs}` : ''}`);
    },
    createContractor: (data: {
      name: string;
      type: 'main' | 'sub';
      contact_email?: string;
      contact_phone?: string;
      address?: string;
    }): Promise<DirectoryContractor> => {
      const sanitized = {
        ...data,
        name: sanitizeInput(data.name),
        contact_phone: data.contact_phone ? sanitizeInput(data.contact_phone) : undefined,
        address: data.address ? sanitizeInput(data.address) : undefined,
      };
      return request<DirectoryContractor>('/contractors', { method: 'POST', body: JSON.stringify(sanitized) });
    },
    updateContractor: (
      id: string,
      data: Partial<{
        name: string;
        type: 'main' | 'sub';
        contact_email?: string;
        contact_phone?: string;
        address?: string;
        is_active?: boolean;
      }>
    ): Promise<DirectoryContractor> => {
      const sanitized = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? sanitizeInput(v) : v])
      );
      return request<DirectoryContractor>(`/contractors/${id}`, { method: 'PATCH', body: JSON.stringify(sanitized) });
    },
    deactivateContractor: (id: string): Promise<DirectoryContractor> =>
      request<DirectoryContractor>(`/contractors/${id}/deactivate`, { method: 'DELETE' }),
    getContractor: (id: string): Promise<DirectoryContractor> => request<DirectoryContractor>(`/contractors/${id}`),
    getAssignments: (params?: {
      main_contractor_id?: string;
      sub_contractor_id?: string;
      site_id?: number;
    }): Promise<DirectoryContractorAssignment[]> => {
      const q = new URLSearchParams();
      if (params?.main_contractor_id) q.append('main_contractor_id', params.main_contractor_id);
      if (params?.sub_contractor_id) q.append('sub_contractor_id', params.sub_contractor_id);
      if (params?.site_id != null) q.append('site_id', params.site_id.toString());
      const qs = q.toString();
      return request<DirectoryContractorAssignment[]>(`/contractors/assignments${qs ? `?${qs}` : ''}`);
    },
    createAssignment: (data: {
      main_contractor_id: string;
      sub_contractor_id: string;
      site_id?: number;
      start_date?: string;
      end_date?: string;
      notes?: string;
    }): Promise<DirectoryContractorAssignment> =>
      request<DirectoryContractorAssignment>('/contractors/assignments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteAssignment: (id: string): Promise<void> =>
      request<void>(`/contractors/assignments/${id}`, { method: 'DELETE' }),
  },
};

export { ApiError };
