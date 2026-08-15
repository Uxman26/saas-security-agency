import type { User, Guard, Site, Assignment, Rota, RotaDetail, RotaSummary, RotaPlanListItem, RotaPlanDetail, RotaPlanPublishResult, LoginResponse, Client, MainContractor, SubContractor, DashboardOverview, ComplianceAlert, ContractExpiryAlert, ClientContractRenewal, Payroll, Invoice, Allowance, GuardDocument, Attendance, Payment, GuardRate, SiteRate, Role, CompanyUser, PermissionMatrix, SpecialDay, DirectoryContractor, DirectoryContractorList, DirectoryContractorAssignment, SignupResponse, SubscriptionReceipt, ReceiptPublic, AdminUserDetail, AdminUserListItem, AdminPayment, PlanTier, Expense, ExpenseMeta, ExpenseDashboard, ExpenseReport, VatReport } from './types';

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
    const error = await response.json().catch(() => ({ detail: 'Unauthorized' }));
    const d = error.detail;
    const msg = typeof d === 'string' ? d : 'Unauthorized';
    if (token && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new ApiError(401, msg);
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
        : typeof d === 'object' && d !== null && 'message' in d
          ? JSON.stringify(d)
          : 'Request failed';
    throw new ApiError(response.status, msg);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

async function requestBlob(
  endpoint: string,
  options?: { method?: string; body?: string }
): Promise<Blob> {
  const raw = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const token = raw ? raw.trim() : null;
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: options?.method || 'GET',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options?.body,
  });
  if (response.status === 401) {
    const error = await response.json().catch(() => ({ detail: 'Unauthorized' }));
    const d = error.detail;
    const msg = typeof d === 'string' ? d : 'Unauthorized';
    if (token && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw new ApiError(401, msg);
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    const d = error.detail;
    const msg = Array.isArray(d)
      ? d.map((x: { msg?: string }) => x.msg).filter(Boolean).join('; ') || 'Request failed'
      : typeof d === 'string'
        ? d
        : typeof d === 'object' && d !== null && 'message' in d
          ? JSON.stringify(d)
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
    login: (data: { email: string; password: string; remember_me?: boolean }): Promise<LoginResponse> => {
      const sanitized = {
        email: sanitizeInput(data.email),
        password: data.password,
        remember_me: data.remember_me ?? true,
      };
      return request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(sanitized) });
    },
    me: (): Promise<User> => request<User>('/auth/me'),
    logout: (): Promise<{ message: string }> =>
      request<{ message: string }>('/auth/logout', { method: 'POST' }),
    logoutAll: (): Promise<{ message: string }> =>
      request<{ message: string }>('/auth/logout-all', { method: 'POST' }),
    forgotPassword: (email: string): Promise<{ message: string }> =>
      request<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: sanitizeInput(email) }),
      }),
    resetPassword: (token: string, new_password: string): Promise<{ message: string }> =>
      request<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, new_password }),
      }),
    verifyEmail: (token: string): Promise<{ message: string }> =>
      request<{ message: string }>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    resendVerification: (email: string): Promise<{ message: string }> =>
      request<{ message: string }>('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: sanitizeInput(email) }),
      }),
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
    uploadPhoto: async (id: number, file: File): Promise<Guard> => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token')?.trim() : null;
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${API_URL}/guards/${id}/photo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
        const d = error.detail;
        const msg = typeof d === 'string' ? d : 'Upload failed';
        throw new ApiError(response.status, msg);
      }
      return response.json();
    },
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
    overtime: (id: number, data: { new_end: string; reason: string }) =>
      request<import('./types').ShiftOvertimeLog>(`/assignments/${id}/overtime`, { method: 'POST', body: JSON.stringify(data) }),
    earlyFinish: (id: number, data: { actual_end: string; reason: string }) =>
      request<import('./types').ShiftEarlyFinishLog>(`/assignments/${id}/early-finish`, { method: 'POST', body: JSON.stringify(data) }),
    overtimeByShift: (data: { guard_id: number; date: string; shift_start: string; site_name: string; new_end: string; reason: string }) =>
      request<import('./types').ShiftOvertimeLog>('/assignments/by-shift/overtime', { method: 'POST', body: JSON.stringify(data) }),
    earlyFinishByShift: (data: { guard_id: number; date: string; shift_start: string; site_name: string; actual_end: string; reason: string }) =>
      request<import('./types').ShiftEarlyFinishLog>('/assignments/by-shift/early-finish', { method: 'POST', body: JSON.stringify(data) }),
    lateness: (id: number, data: { late_minutes: number; scheduled_start?: string; note?: string }) =>
      request<import('./types').ShiftLateLog>(`/assignments/${id}/lateness`, { method: 'POST', body: JSON.stringify(data) }),
    latenessByShift: (data: { guard_id: number; date: string; shift_start: string; site_name: string; late_minutes: number; note?: string }) =>
      request<import('./types').ShiftLateLog>('/assignments/by-shift/lateness', { method: 'POST', body: JSON.stringify(data) }),
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
      data: Partial<{
        name: string;
        view_mode: string;
        budget: number;
        planner_data: string;
        day_count: number;
        start_date: string;
      }>
    ): Promise<RotaPlanDetail> =>
      request<RotaPlanDetail>(`/rotas/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> => request<void>(`/rotas/${id}`, { method: 'DELETE' }),
    publish: (id: number, guardId?: number): Promise<RotaPlanPublishResult> =>
      request<RotaPlanPublishResult>(
        guardId != null ? `/rotas/${id}/publish?guard_id=${guardId}` : `/rotas/${id}/publish`,
        { method: 'POST' }
      ),
    unpublishGuard: (id: number, guardId: number): Promise<RotaPlanPublishResult> =>
      request<RotaPlanPublishResult>(`/rotas/${id}/unpublish/${guardId}`, { method: 'POST' }),
    unpublish: (id: number): Promise<RotaPlanPublishResult> =>
      request<RotaPlanPublishResult>(`/rotas/${id}/unpublish`, { method: 'POST' }),
    copy: (
      id: number,
      data: {
        name: string;
        start_date: string;
        day_count?: number;
        view_mode?: string;
        budget?: number;
        include_attendance_and_notes?: boolean;
      }
    ): Promise<RotaPlanDetail> =>
      request<RotaPlanDetail>(`/rotas/${id}/copy`, { method: 'POST', body: JSON.stringify(data) }),
    exportPlanner: (planner_data: string, format: 'pdf' = 'pdf'): Promise<Blob> =>
      requestBlob('/rotas/export', {
        method: 'POST',
        body: JSON.stringify({ planner_data, format }),
      }),
  },
  staffRequests: {
    list: (status?: string): Promise<import('./types').StaffRequest[]> =>
      request<import('./types').StaffRequest[]>(status ? `/staff-requests?status=${status}` : '/staff-requests'),
    get: (id: number): Promise<import('./types').StaffRequest> =>
      request<import('./types').StaffRequest>(`/staff-requests/${id}`),
    createBulk: (data: {
      client_id?: number;
      site_id: number;
      shift_start: string;
      shift_end: string;
      break_minutes?: number;
      staff_count?: number;
      client_notes?: string;
      shifts: {
        shift_date: string;
        shift_start?: string;
        shift_end?: string;
        break_minutes?: number;
        staff_count?: number;
      }[];
    }): Promise<import('./types').StaffRequest[]> =>
      request<import('./types').StaffRequest[]>('/staff-requests/bulk', { method: 'POST', body: JSON.stringify(data) }),
    approve: (id: number, comment?: string): Promise<import('./types').StaffRequest> =>
      request<import('./types').StaffRequest>(`/staff-requests/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ comment: comment || '' }),
      }),
    reject: (id: number, comment?: string): Promise<import('./types').StaffRequest> =>
      request<import('./types').StaffRequest>(`/staff-requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ comment: comment || '' }),
      }),
  },
  portal: {
    sites: (): Promise<Site[]> => request<Site[]>('/portal/sites'),
    // site_id narrows to one of the caller's own sites; the API 404s anything else, so
    // passing it is a convenience filter, not the access control itself.
    rotaCurrent: (site_id?: number): Promise<RotaDetail[]> =>
      request<RotaDetail[]>(`/portal/rota/current${site_id ? `?site_id=${site_id}` : ''}`),
    rotaUpcoming: (site_id?: number): Promise<RotaDetail[]> =>
      request<RotaDetail[]>(`/portal/rota/upcoming${site_id ? `?site_id=${site_id}` : ''}`),
    rotaPrevious: (site_id?: number): Promise<RotaDetail[]> =>
      request<RotaDetail[]>(`/portal/rota/previous${site_id ? `?site_id=${site_id}` : ''}`),
    hours: (params?: { period?: string; start_date?: string; end_date?: string; site_id?: number }): Promise<import('./types').PortalHours> => {
      const q = new URLSearchParams();
      if (params?.period) q.set('period', params.period);
      if (params?.start_date) q.set('start_date', params.start_date);
      if (params?.end_date) q.set('end_date', params.end_date);
      if (params?.site_id) q.set('site_id', String(params.site_id));
      const qs = q.toString();
      return request<import('./types').PortalHours>(`/portal/hours${qs ? `?${qs}` : ''}`);
    },
    patrolToday: (): Promise<import('./types').PatrolToday> => request('/portal/patrol/today'),
    patrolCompliance: (start_date: string, end_date: string, site_id?: number) => {
      const q = new URLSearchParams({ start_date, end_date });
      if (site_id) q.set('site_id', String(site_id));
      return request<import('./types').PatrolComplianceRow[]>(`/portal/patrol/compliance?${q}`);
    },
    incidents: (status?: string) =>
      request<import('./types').Incident[]>(`/portal/incidents${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    createIncident: (data: Partial<import('./types').Incident> & { notes: string }) =>
      request<import('./types').Incident>('/portal/incidents', { method: 'POST', body: JSON.stringify(data) }),
  },
  patrol: {
    listRoutes: (site_id?: number) =>
      request<import('./types').PatrolRoute[]>(`/patrol/routes${site_id ? `?site_id=${site_id}` : ''}`),
    getRoute: (id: number) => request<import('./types').PatrolRoute>(`/patrol/routes/${id}`),
    createRoute: (data: Record<string, unknown>) =>
      request<import('./types').PatrolRoute>('/patrol/routes', { method: 'POST', body: JSON.stringify(data) }),
    updateRoute: (id: number, data: Record<string, unknown>) =>
      request<import('./types').PatrolRoute>(`/patrol/routes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteRoute: (id: number) => request<void>(`/patrol/routes/${id}`, { method: 'DELETE' }),
    createCheckpoint: (data: Record<string, unknown>) =>
      request<import('./types').PatrolCheckpoint>('/patrol/checkpoints', { method: 'POST', body: JSON.stringify(data) }),
    updateCheckpoint: (id: number, data: Record<string, unknown>) =>
      request<import('./types').PatrolCheckpoint>(`/patrol/checkpoints/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteCheckpoint: (id: number) => request<void>(`/patrol/checkpoints/${id}`, { method: 'DELETE' }),
    qrPngUrl: (id: number) => `${API_URL}/patrol/checkpoints/${id}/qr.png`,
    qrPdfUrl: (id: number) => `${API_URL}/patrol/checkpoints/${id}/qr.pdf`,
    downloadQr: (id: number, kind: 'png' | 'pdf' = 'png') =>
      requestBlob(`/patrol/checkpoints/${id}/qr.${kind}`),
    startSession: (data: { route_id: number; guard_id?: number; assignment_id?: number }) =>
      request('/patrol/sessions/start', { method: 'POST', body: JSON.stringify(data) }),
    scan: (data: Record<string, unknown>) =>
      request<import('./types').PatrolLog>('/patrol/checkpoint-scan', { method: 'POST', body: JSON.stringify(data) }),
    logs: (params?: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams();
      if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)); });
      const qs = q.toString();
      return request<import('./types').PatrolLog[]>(`/patrol/logs${qs ? `?${qs}` : ''}`);
    },
    compliance: (start_date: string, end_date: string, site_id?: number) => {
      const q = new URLSearchParams({ start_date, end_date });
      if (site_id) q.set('site_id', String(site_id));
      return request<import('./types').PatrolComplianceRow[]>(`/patrol/reports/compliance?${q}`);
    },
    detail: (start_date: string, end_date: string, route_id?: number) => {
      const q = new URLSearchParams({ start_date, end_date });
      if (route_id) q.set('route_id', String(route_id));
      return request<import('./types').PatrolLog[]>(`/patrol/reports/detail?${q}`);
    },
    today: (): Promise<import('./types').PatrolToday> => request('/patrol/today'),
  },
  incidents: {
    list: (params?: Record<string, string | undefined>) => {
      const q = new URLSearchParams();
      if (params) Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
      const qs = q.toString();
      return request<import('./types').Incident[]>(`/incidents${qs ? `?${qs}` : ''}`);
    },
    get: (id: number) => request<import('./types').Incident>(`/incidents/${id}`),
    create: (data: Record<string, unknown>) =>
      request<import('./types').Incident>('/incidents', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Record<string, unknown>) =>
      request<import('./types').Incident>(`/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    summary: (start_date?: string, end_date?: string) => {
      const q = new URLSearchParams();
      if (start_date) q.set('start_date', start_date);
      if (end_date) q.set('end_date', end_date);
      const qs = q.toString();
      return request<import('./types').IncidentSummaryRow[]>(`/incidents/reports/summary${qs ? `?${qs}` : ''}`);
    },
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
  leads: {
    list: (params?: Record<string, string | number | boolean | undefined>) => {
      const q = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== '' && v !== '__all') q.append(k, String(v));
        });
      }
      const qs = q.toString();
      return request<import('./types').Lead[]>(`/leads${qs ? `?${qs}` : ''}`);
    },
    get: (id: number) => request<import('./types').Lead>(`/leads/${id}`),
    create: (data: Record<string, unknown>) => request<import('./types').Lead>('/leads', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Record<string, unknown>) =>
      request<import('./types').Lead>(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/leads/${id}`, { method: 'DELETE' }),
    statuses: () => request<{ name: string; custom: boolean; id?: number }[]>('/leads/statuses'),
    changeStatus: (id: number, status: string, note?: string) =>
      request<import('./types').Lead>(`/leads/${id}/status`, { method: 'POST', body: JSON.stringify({ status, note }) }),
    assign: (id: number, assigned_user_id: number) =>
      request<import('./types').Lead>(`/leads/${id}/assign?assigned_user_id=${assigned_user_id}`, { method: 'POST' }),
    checkDuplicate: (data: { email?: string; phone?: string; exclude_id?: number }) =>
      request<{ field: string; lead_id: number; title: string }[]>('/leads/check-duplicate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    dashboard: (start_date?: string, end_date?: string) => {
      const q = new URLSearchParams();
      if (start_date) q.append('start_date', start_date);
      if (end_date) q.append('end_date', end_date);
      const qs = q.toString();
      return request<import('./types').LeadDashboard>(`/leads/dashboard${qs ? `?${qs}` : ''}`);
    },
    addNote: (id: number, body: string) =>
      request<Record<string, unknown>>(`/leads/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
    addFollowUp: (id: number, data: Record<string, unknown>) =>
      request<Record<string, unknown>>(`/leads/${id}/follow-ups`, { method: 'POST', body: JSON.stringify(data) }),
    completeFollowUp: (id: number) =>
      request<Record<string, unknown>>(`/leads/follow-ups/${id}/complete`, { method: 'POST' }),
    addCommunication: (id: number, data: Record<string, unknown>) =>
      request<Record<string, unknown>>(`/leads/${id}/communications`, { method: 'POST', body: JSON.stringify(data) }),
    convert: (id: number, target_type: string, note?: string) =>
      request<Record<string, unknown>>(`/leads/${id}/convert`, { method: 'POST', body: JSON.stringify({ target_type, note }) }),
    audit: (id: number) => request<Record<string, unknown>[]>(`/leads/${id}/audit`),
    detail: (id: number) => request<Record<string, unknown>>(`/leads/${id}/detail`),
    listPresets: () => request<{ id: number; name: string; filters: Record<string, unknown> }[]>('/leads/filter-presets'),
    savePreset: (name: string, filters: Record<string, unknown>) =>
      request<{ id: number; name: string }>('/leads/filter-presets', { method: 'POST', body: JSON.stringify({ name, filters }) }),
    deletePreset: (id: number) => request<void>(`/leads/filter-presets/${id}`, { method: 'DELETE' }),
    followUpCalendar: (start_date: string, end_date: string, assigned_user_id?: number) => {
      const q = new URLSearchParams({ start_date, end_date });
      if (assigned_user_id) q.append('assigned_user_id', String(assigned_user_id));
      return request<Record<string, unknown>[]>(`/leads/follow-ups/calendar?${q}`);
    },
    uploadDocument: async (id: number, file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_URL}/leads/${id}/documents`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    documentUrl: (leadId: number, docId: number) => {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      return `${API_URL}/leads/${leadId}/documents/${docId}/file`;
    },
    addQuotation: (id: number, data: { title: string; amount?: number; status?: string; notes?: string }) =>
      request<Record<string, unknown>>(`/leads/${id}/quotations`, { method: 'POST', body: JSON.stringify(data) }),
    pushSubscribe: (data: { endpoint: string; p256dh: string; auth: string }) =>
      request<{ ok: boolean }>('/leads/push/subscribe', { method: 'POST', body: JSON.stringify(data) }),
    notifications: (unread_only?: boolean) =>
      request<Record<string, unknown>[]>(`/leads/notifications${unread_only ? '?unread_only=true' : ''}`),
    unreadNotificationCount: () =>
      request<{ count: number }>('/leads/notifications/unread-count'),
    readNotification: (id: number) =>
      request<Record<string, unknown>>(`/leads/notifications/${id}/read`, { method: 'POST' }),
    readAllNotifications: () =>
      request<{ updated: number }>('/leads/notifications/read-all', { method: 'POST' }),
    exportUrl: (params?: Record<string, string>) => {
      const q = new URLSearchParams(params);
      return `/api/leads/export?${q}`;
    },
  },
  stripe: {
    config: () => request<{ enabled: boolean; publishable_key: string; yearly_discount_percent?: number }>('/stripe/config'),
    checkoutSession: (ref_id: string, billing_cycle?: string, coupon?: string) =>
      request<{ url: string; session_id: string }>('/stripe/checkout-session', {
        method: 'POST',
        body: JSON.stringify({ ref_id, billing_cycle: billing_cycle || 'monthly', coupon }),
      }),
    sessionStatus: (session_id: string) =>
      request<{ payment_status: string; paid: boolean; receipt_ref?: string }>(
        `/stripe/session-status?session_id=${encodeURIComponent(session_id)}`
      ),
    portal: () => request<{ url: string }>('/stripe/portal', { method: 'POST' }),
    previewChange: (tier: string, billing_cycle: string) =>
      request<{ amount_due: number; currency: string }>('/stripe/preview-change', {
        method: 'POST',
        body: JSON.stringify({ tier, billing_cycle }),
      }),
    changePlan: (tier: string, billing_cycle: string, proration_behavior?: string) =>
      request<Record<string, unknown>>('/stripe/change-plan', {
        method: 'POST',
        body: JSON.stringify({ tier, billing_cycle, proration_behavior }),
      }),
    cancel: () => request<Record<string, unknown>>('/stripe/cancel', { method: 'POST' }),
    reactivate: () => request<Record<string, unknown>>('/stripe/reactivate', { method: 'POST' }),
    connectOnboard: (return_url: string, refresh_url: string) =>
      request<{ url: string }>('/stripe/connect/onboard', {
        method: 'POST',
        body: JSON.stringify({ return_url, refresh_url }),
      }),
  },
  billing: {
    receipts: () =>
      request<
        {
          id: number;
          receipt_number: string;
          amount: number;
          currency: string;
          plan_name?: string;
          billing_cycle?: string;
          payment_method_last4?: string;
          invoice_url?: string;
          next_renewal_date?: string;
          paid_at?: string;
        }[]
      >('/billing/receipts'),
    receipt: (id: number) =>
      request<{
        id: number;
        receipt_number: string;
        amount: number;
        currency: string;
        plan_name?: string;
        billing_cycle?: string;
        payment_method_last4?: string;
        invoice_url?: string;
        next_renewal_date?: string;
        paid_at?: string;
      }>(`/billing/receipts/${id}`),
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
    config: (): Promise<import('./types').EmailConfig> => request<import('./types').EmailConfig>('/email/config'),
    updateConfig: (data: {
      templates?: Record<string, string>;
      mail_server?: string;
      mail_port?: number | null;
      mail_username?: string;
      mail_password?: string;
      mail_from?: string;
      mail_from_name?: string;
    }) => request<import('./types').EmailConfig>('/email/config', { method: 'PATCH', body: JSON.stringify(data) }),
    send: (data: { to_email: string; subject: string; body: string }): Promise<import('./types').EmailLog> => {
      const sanitized = {
        to_email: sanitizeInput(data.to_email),
        subject: sanitizeInput(data.subject),
        body: data.body,
      };
      return request<import('./types').EmailLog>('/email/send', { method: 'POST', body: JSON.stringify(sanitized) });
    },
    test: (data: { to_email: string; subject?: string; body?: string }) =>
      request<import('./types').EmailLog>('/email/test', { method: 'POST', body: JSON.stringify(data) }),
    logs: (): Promise<import('./types').EmailLog[]> => request<import('./types').EmailLog[]>('/email/logs'),
  },
  reports: {
    dashboard: (): Promise<DashboardOverview> => request<DashboardOverview>('/reports/dashboard'),
    compliance: (days?: number): Promise<ComplianceAlert[]> => request<ComplianceAlert[]>(`/reports/compliance${days != null ? `?days=${days}` : ''}`),
    contractsExpiring: (days?: number): Promise<ContractExpiryAlert[]> =>
      request<ContractExpiryAlert[]>(`/reports/contracts-expiring${days != null ? `?days=${days}` : ''}`),
    hub: (start_date: string, end_date: string): Promise<import('./types').ReportsHub> =>
      request<import('./types').ReportsHub>(`/reports/hub?start_date=${start_date}&end_date=${end_date}`),
    staffIndividual: (guard_id: number, start_date: string, end_date: string): Promise<import('./types').StaffIndividualReport> =>
      request<import('./types').StaffIndividualReport>(`/reports/staff/${guard_id}?start_date=${start_date}&end_date=${end_date}`),
    staffMonthly: (start_date: string, end_date: string, group_by = 'guard') =>
      request<import('./types').StaffMonthlyReport>(`/reports/staff/monthly?start_date=${start_date}&end_date=${end_date}&group_by=${group_by}`),
    shiftHours: (start_date: string, end_date: string, guard_id?: number, site_id?: number) => {
      const q = new URLSearchParams({ start_date, end_date });
      if (guard_id) q.append('guard_id', String(guard_id));
      if (site_id) q.append('site_id', String(site_id));
      return request<{
        shifts: Record<string, unknown>[];
        by_employee: Record<string, unknown>[];
        total_shifts: number;
        workforce_total_hours: number;
      }>(`/reports/staff/shift-hours?${q}`);
    },
    attendance: (start_date: string, end_date: string, guard_id?: number) => {
      const q = new URLSearchParams({ start_date, end_date });
      if (guard_id) q.append('guard_id', String(guard_id));
      return request<Record<string, unknown>[]>(`/reports/attendance?${q}`);
    },
    shiftOvertime: (start_date: string, end_date: string, guard_id?: number) => {
      const q = new URLSearchParams({ start_date, end_date });
      if (guard_id) q.append('guard_id', String(guard_id));
      return request<Record<string, unknown>[]>(`/reports/shift-overtime?${q}`);
    },
    shiftEarlyFinish: (start_date: string, end_date: string, guard_id?: number) => {
      const q = new URLSearchParams({ start_date, end_date });
      if (guard_id) q.append('guard_id', String(guard_id));
      return request<Record<string, unknown>[]>(`/reports/shift-early-finish?${q}`);
    },
    shiftLateness: (start_date: string, end_date: string, guard_id?: number) => {
      const q = new URLSearchParams({ start_date, end_date });
      if (guard_id) q.append('guard_id', String(guard_id));
      return request<Record<string, unknown>[]>(`/reports/shift-lateness?${q}`);
    },
    financialInvoices: (start_date: string, end_date: string) =>
      request<Record<string, unknown>[]>(`/reports/financial/invoices?start_date=${start_date}&end_date=${end_date}`),
    subscriptionSummary: () => request<import('./types').SubscriptionReportSummary>('/reports/subscription/summary'),
    subscriptionInvoices: (start_date: string, end_date: string) =>
      request<Record<string, unknown>[]>(`/reports/subscription/invoices?start_date=${start_date}&end_date=${end_date}`),
    usageLogins: (start_date: string, end_date: string) => {
      const q = new URLSearchParams({ start_date, end_date });
      return request<Record<string, unknown>[]>(`/reports/usage/logins?${q}`);
    },
    usageSummary: (start_date: string, end_date: string) => {
      const q = new URLSearchParams({ start_date, end_date });
      return request<import('./types').UsageSummary>(`/reports/usage/summary?${q}`);
    },
    export: async (
      report_type: string,
      start_date: string,
      end_date: string,
      format: string,
      guard_id?: number,
      site_id?: number,
      group_by?: string
    ) => {
      const q = new URLSearchParams({ start_date, end_date, format });
      if (guard_id) q.append('guard_id', String(guard_id));
      if (site_id) q.append('site_id', String(site_id));
      if (group_by) q.append('group_by', group_by);
      return requestBlob(`/reports/export/${report_type}?${q}`);
    },
  },
  sms: {
    config: (): Promise<import('./types').SmsConfig> => request<import('./types').SmsConfig>('/sms/config'),
    updateConfig: (data: Partial<{ twilio_account_sid: string; twilio_auth_token: string; twilio_phone_number: string; templates: Record<string, string> }>) =>
      request<import('./types').SmsConfig>('/sms/config', { method: 'PATCH', body: JSON.stringify(data) }),
    send: (recipient: string, body: string, template_key?: string) =>
      request<import('./types').SmsLog>('/sms/send', { method: 'POST', body: JSON.stringify({ recipient, body, template_key }) }),
    logs: (): Promise<import('./types').SmsLog[]> => request<import('./types').SmsLog[]>('/sms/logs'),
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
    calculateBatch: (data: {
      mode: 'employee' | 'site' | 'rota';
      period_start: string;
      period_end: string;
      guard_id?: number;
      site_id?: number;
      rota_plan_id?: number;
    }): Promise<Payroll[]> =>
      request<Payroll[]>('/payroll/calculate-batch', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: number,
      data: Partial<Pick<Payroll, 'period_start' | 'period_end' | 'total_hours' | 'hourly_rate' | 'bank_amount' | 'cash_amount' | 'allowance_total' | 'payment_mode'>>
    ): Promise<Payroll> => request<Payroll>(`/payroll/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> => request<void>(`/payroll/${id}`, { method: 'DELETE' }),
  },
  invoices: {
    list: (params?: {
      client_id?: number;
      status?: string;
      status_group?: 'unpaid' | 'draft' | 'all';
      due_from?: string;
      due_to?: string;
      search?: string;
    }): Promise<Invoice[]> => {
      const q = new URLSearchParams();
      if (params?.client_id) q.append('client_id', params.client_id.toString());
      if (params?.status) q.append('status', params.status);
      if (params?.status_group && params.status_group !== 'all') q.append('status_group', params.status_group);
      if (params?.due_from) q.append('due_from', params.due_from);
      if (params?.due_to) q.append('due_to', params.due_to);
      if (params?.search) q.append('search', params.search);
      const qs = q.toString();
      return request<Invoice[]>(`/invoices${qs ? `?${qs}` : ''}`);
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
    generate: (params: {
      period_start: string;
      period_end: string;
      client_id?: number;
      site_id?: number;
    }): Promise<Invoice> => {
      const q = new URLSearchParams({
        period_start: params.period_start,
        period_end: params.period_end,
      });
      if (params.client_id) q.append('client_id', params.client_id.toString());
      if (params.site_id) q.append('site_id', params.site_id.toString());
      return request<Invoice>(`/invoices/generate?${q.toString()}`, { method: 'POST' });
    },
    updateStatus: (id: number, status: string): Promise<Invoice> => request<Invoice>(`/invoices/${id}/status?status=${encodeURIComponent(status)}`, { method: 'PATCH' }),
    addLine: (
      invoiceId: number,
      data: { site_id: number; guard_id?: number; hours: number; rate: number; allowance_amount?: number }
    ): Promise<import('./types').InvoiceLine> =>
      request<import('./types').InvoiceLine>(`/invoices/${invoiceId}/lines`, { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> => request<void>(`/invoices/${id}`, { method: 'DELETE' }),
    duplicate: (id: number): Promise<Invoice> =>
      request<Invoice>(`/invoices/${id}/duplicate`, { method: 'POST' }),
  },
  expenses: {
    meta: (): Promise<ExpenseMeta> => request<ExpenseMeta>('/expenses/meta'),
    list: (params?: {
      start_date?: string;
      end_date?: string;
      category?: string;
      payment_status?: string;
    }): Promise<Expense[]> => {
      const q = new URLSearchParams();
      if (params?.start_date) q.append('start_date', params.start_date);
      if (params?.end_date) q.append('end_date', params.end_date);
      if (params?.category) q.append('category', params.category);
      if (params?.payment_status) q.append('payment_status', params.payment_status);
      const qs = q.toString();
      return request<Expense[]>(`/expenses${qs ? `?${qs}` : ''}`);
    },
    get: (id: number): Promise<Expense> => request<Expense>(`/expenses/${id}`),
    create: (data: {
      expense_date: string;
      category: string;
      vendor_name?: string;
      reference_number?: string;
      description?: string;
      amount_ex_vat: number;
      payment_method?: string;
      payment_status?: string;
    }): Promise<Expense> => request<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: number,
      data: Partial<{
        expense_date: string;
        category: string;
        vendor_name: string;
        reference_number: string;
        description: string;
        amount_ex_vat: number;
        payment_method: string;
        payment_status: string;
      }>
    ): Promise<Expense> => request<Expense>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> => request<void>(`/expenses/${id}`, { method: 'DELETE' }),
    dashboard: (start_date: string, end_date: string): Promise<ExpenseDashboard> =>
      request<ExpenseDashboard>(`/expenses/dashboard?start_date=${start_date}&end_date=${end_date}`),
    expenseReport: (start_date: string, end_date: string, group_by: string): Promise<ExpenseReport> =>
      request<ExpenseReport>(`/expenses/reports/expenses?start_date=${start_date}&end_date=${end_date}&group_by=${group_by}`),
    vatReport: (start_date: string, end_date: string): Promise<VatReport> =>
      request<VatReport>(`/expenses/reports/vat?start_date=${start_date}&end_date=${end_date}`),
    uploadDocument: async (id: number, file: File): Promise<Expense> => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token')?.trim() : null;
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${API_URL}/expenses/${id}/document`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
        const d = error.detail;
        const msg = typeof d === 'string' ? d : 'Upload failed';
        throw new ApiError(response.status, msg);
      }
      return response.json();
    },
    documentUrl: (id: number) => `${API_URL}/expenses/${id}/document`,
    deleteDocument: (id: number): Promise<Expense> =>
      request<Expense>(`/expenses/${id}/document`, { method: 'DELETE' }),
  },
  company: {
    profile: (): Promise<import('./types').CompanyProfile> => request<import('./types').CompanyProfile>('/company/profile'),
    updateProfile: (data: Partial<import('./types').CompanyProfile>): Promise<import('./types').CompanyProfile> =>
      request<import('./types').CompanyProfile>('/company/profile', { method: 'PATCH', body: JSON.stringify(data) }),
    uploadLogo: async (file: File): Promise<import('./types').CompanyProfile> => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token')?.trim() : null;
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${API_URL}/company/logo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
        const d = error.detail;
        const msg = typeof d === 'string' ? d : 'Upload failed';
        throw new ApiError(response.status, msg);
      }
      return response.json();
    },
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
  packages: {
    list: (): Promise<PlanTier[]> => request<PlanTier[]>('/subscriptions/packages'),
  },
  subscriptions: {
    get: (): Promise<{
      subscription_tier?: string;
      billing_cycle?: string;
      subscription_status?: string;
      subscription_end?: string;
    }> => request('/subscriptions'),
  },
  admin: {
    dashboard: (): Promise<import('./types').AdminDashboard> => request<import('./types').AdminDashboard>('/admin/dashboard'),
    companies: (): Promise<import('./types').Company[]> => request<import('./types').Company[]>('/admin/companies'),
    company: (id: number): Promise<import('./types').Company> => request<import('./types').Company>(`/admin/companies/${id}`),
    patchCompany: (
      id: number,
      data: {
        name?: string;
        subscription_tier?: string;
        subscription_status?: string;
        subscription_end?: string;
        billing_cycle?: string;
        max_users?: number | null;
        enabled_modules?: Record<string, boolean>;
      }
    ): Promise<import('./types').Company> =>
      request<import('./types').Company>(`/admin/companies/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    patchCompanyModules: (id: number, enabled_modules: Record<string, boolean>): Promise<import('./types').Company> =>
      request<import('./types').Company>(`/admin/companies/${id}/modules`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled_modules }),
      }),
    users: (): Promise<AdminUserListItem[]> => request<AdminUserListItem[]>('/admin/users'),
    patchUserActive: (id: number, is_active: boolean): Promise<AdminUserListItem> =>
      request<AdminUserListItem>(`/admin/users/${id}/active`, { method: 'PATCH', body: JSON.stringify({ is_active }) }),
    invoices: (params?: { company_id?: number; status?: string }): Promise<import('./types').SubscriptionInvoice[]> => {
      const q = new URLSearchParams();
      if (params?.company_id) q.append('company_id', params.company_id.toString());
      if (params?.status) q.append('status', params.status);
      const qs = q.toString();
      return request<import('./types').SubscriptionInvoice[]>(`/admin/invoices${qs ? `?${qs}` : ''}`);
    },
    invoice: (id: number): Promise<import('./types').SubscriptionInvoice> =>
      request<import('./types').SubscriptionInvoice>(`/admin/invoices/${id}`),
    patchInvoiceStatus: (id: number, status: string): Promise<import('./types').SubscriptionInvoice> =>
      request<import('./types').SubscriptionInvoice>(`/admin/invoices/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    recordInvoicePayment: (id: number, amount: number): Promise<import('./types').SubscriptionInvoice> =>
      request<import('./types').SubscriptionInvoice>(`/admin/invoices/${id}/payment`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      }),
    sendInvoiceEmail: (id: number): Promise<import('./types').SubscriptionInvoice> =>
      request<import('./types').SubscriptionInvoice>(`/admin/invoices/${id}/send-email`, { method: 'POST' }),
    generateInvoices: (): Promise<{ created: number }> => request<{ created: number }>('/admin/invoices/generate', { method: 'POST' }),
    loginLogs: (company_id?: number): Promise<import('./types').LoginLog[]> => {
      const q = company_id ? `?company_id=${company_id}` : '';
      return request<import('./types').LoginLog[]>(`/admin/login-logs${q}`);
    },
    payments: (company_id?: number): Promise<AdminPayment[]> => {
      const q = company_id ? `?company_id=${company_id}` : '';
      return request<AdminPayment[]>(`/admin/payments${q}`);
    },
    packages: (): Promise<PlanTier[]> => request<PlanTier[]>('/admin/packages'),
    patchPackage: (
      tier: string,
      data: { price_gbp?: number; max_guards?: number; max_sites?: number; max_users?: number; features?: Record<string, boolean> }
    ): Promise<PlanTier> =>
      request<PlanTier>(`/admin/packages/${tier}`, { method: 'PATCH', body: JSON.stringify(data) }),
    smtp: (): Promise<import('./types').SmtpConfig> => request<import('./types').SmtpConfig>('/admin/smtp'),
    patchSmtp: (data: {
      mail_server?: string;
      mail_port?: number;
      mail_username?: string;
      mail_password?: string;
      mail_from?: string;
      mail_from_name?: string;
    }) => request<import('./types').SmtpConfig>('/admin/smtp', { method: 'PATCH', body: JSON.stringify(data) }),
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
  modules: {
    list: (opts?: { all_modules?: boolean }): Promise<import('./types').AppModule[]> =>
      request(`/modules${opts?.all_modules ? '?all_modules=true' : ''}`),
    create: (data: Partial<import('./types').AppModule>): Promise<import('./types').AppModule> =>
      request('/modules', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<import('./types').AppModule>): Promise<import('./types').AppModule> =>
      request(`/modules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  users: {
    list: (): Promise<CompanyUser[]> => request<CompanyUser[]>('/users'),
    get: (id: number): Promise<CompanyUser> => request<CompanyUser>(`/users/${id}`),
    create: (data: {
      email: string;
      password: string;
      full_name: string;
      role_id: number;
      client_id?: number | null;
      guard_id?: number | null;
      site_ids?: number[];
    }): Promise<CompanyUser> =>
      request<CompanyUser>('/users', {
        method: 'POST',
        body: JSON.stringify({
          email: sanitizeInput(data.email),
          password: data.password,
          full_name: sanitizeInput(data.full_name),
          role_id: data.role_id,
          // The Client and Staff roles are rejected server-side without these, and site
          // pins are how a Client login is narrowed to specific sites.
          ...(data.client_id != null ? { client_id: data.client_id } : {}),
          ...(data.guard_id != null ? { guard_id: data.guard_id } : {}),
          ...(data.site_ids !== undefined ? { site_ids: data.site_ids } : {}),
        }),
      }),
    update: (
      id: number,
      data: {
        email?: string;
        full_name?: string;
        password?: string;
        role_id?: number;
        client_id?: number | null;
        guard_id?: number | null;
        site_ids?: number[];
      }
    ): Promise<CompanyUser> =>
      request<CompanyUser>(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...(data.email !== undefined ? { email: sanitizeInput(data.email) } : {}),
          ...(data.full_name !== undefined ? { full_name: sanitizeInput(data.full_name) } : {}),
          ...(data.password ? { password: data.password } : {}),
          ...(data.role_id !== undefined ? { role_id: data.role_id } : {}),
          ...(data.client_id !== undefined ? { client_id: data.client_id } : {}),
          ...(data.guard_id !== undefined ? { guard_id: data.guard_id } : {}),
          // [] clears the pins back to client-wide; omitting leaves them untouched.
          ...(data.site_ids !== undefined ? { site_ids: data.site_ids } : {}),
        }),
      }),
    resetPassword: (id: number, new_password: string): Promise<CompanyUser> =>
      request<CompanyUser>(`/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password }),
      }),
    delete: (id: number): Promise<void> => request<void>(`/users/${id}`, { method: 'DELETE' }),
    patchRole: (userId: number, role_id: number): Promise<CompanyUser> =>
      request<CompanyUser>(`/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role_id }) }),
  },
  documents: {
    list: (guard_id?: number): Promise<GuardDocument[]> => {
      const q = new URLSearchParams();
      if (guard_id) q.append('guard_id', guard_id.toString());
      return request<GuardDocument[]>(`/documents?${q.toString()}`);
    },
    create: (data: { guard_id: number; document_type: string; file_path?: string; file_name?: string; expiry_date?: string }): Promise<GuardDocument> =>
      request<GuardDocument>('/documents', { method: 'POST', body: JSON.stringify(data) }),
    upload: async (
      guard_id: number,
      document_type: string,
      files: File[],
      expiry_date?: string
    ): Promise<GuardDocument[]> => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token')?.trim() : null;
      const form = new FormData();
      form.append('guard_id', String(guard_id));
      form.append('document_type', document_type);
      if (expiry_date) form.append('expiry_date', expiry_date);
      files.forEach((f) => form.append('files', f));
      const response = await fetch(`${API_URL}/documents/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
        throw new ApiError(401, 'Unauthorized');
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
        const d = error.detail;
        const msg = typeof d === 'string' ? d : 'Upload failed';
        throw new ApiError(response.status, msg);
      }
      return response.json();
    },
    downloadUrl: (id: number) => `${API_URL}/documents/${id}/file`,
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
    update: (
      id: number,
      data: { booked_at?: string | null; booked_off_at?: string | null; status?: string; note?: string | null }
    ): Promise<Attendance> =>
      request<Attendance>(`/attendance/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    upsertByShift: (data: {
      guard_id: number;
      date: string;
      shift_start: string;
      site_name: string;
      status: string;
      note?: string;
      hours?: string | number;
    }): Promise<Attendance> =>
      request<Attendance>('/attendance/by-shift', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> => request<void>(`/attendance/${id}`, { method: 'DELETE' }),
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
    update: (
      id: number,
      data: { invoice_id?: number | null; amount?: number; method?: string; paid_at?: string }
    ): Promise<Payment> =>
      request<Payment>(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number): Promise<void> => request<void>(`/payments/${id}`, { method: 'DELETE' }),
  },
  rates: {
    guardRates: (guard_id: number): Promise<GuardRate[]> => request<GuardRate[]>(`/rates/guards/${guard_id}`),
    createGuardRate: (guard_id: number, data: { hourly_rate: number; effective_from: string }): Promise<GuardRate> =>
      request<GuardRate>(`/rates/guards/${guard_id}`, { method: 'POST', body: JSON.stringify(data) }),
    deleteGuardRate: (rate_id: number): Promise<void> =>
      request<void>(`/rates/guards/${rate_id}`, { method: 'DELETE' }),
    siteRates: (site_id: number): Promise<SiteRate[]> => request<SiteRate[]>(`/rates/sites/${site_id}`),
    createSiteRate: (site_id: number, data: { shift_type: string; hourly_rate: number }): Promise<SiteRate> =>
      request<SiteRate>(`/rates/sites/${site_id}`, { method: 'POST', body: JSON.stringify(data) }),
    deleteSiteRate: (rate_id: number): Promise<void> =>
      request<void>(`/rates/sites/${rate_id}`, { method: 'DELETE' }),
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
      postcode?: string;
    }): Promise<DirectoryContractor> => {
      const sanitized = {
        ...data,
        name: sanitizeInput(data.name),
        contact_phone: data.contact_phone ? sanitizeInput(data.contact_phone) : undefined,
        address: data.address ? sanitizeInput(data.address) : undefined,
        postcode: data.postcode ? sanitizeInput(data.postcode) : undefined,
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
        postcode?: string;
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
  marketing: {
    requestDemo: (data: {
      full_name: string;
      email: string;
      company_name: string;
      industry: string;
      workforce_size: string;
      challenge: string;
      phone?: string;
      current_system?: string;
      preferred_time?: string;
    }): Promise<{ ok: boolean }> =>
      request<{ ok: boolean }>('/marketing/demo', { method: 'POST', body: JSON.stringify(data) }),
  },
};

export { ApiError };
