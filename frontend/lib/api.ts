import type { User, Guard, Site, Assignment, Rota, LoginResponse, Client, SubContractor, DashboardStats, ComplianceAlert, Payroll, Invoice, Allowance } from './types';

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
    throw new ApiError(response.status, error.detail || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

export const api = {
  auth: {
    signup: (data: { email: string; password: string; full_name: string; company_name: string }): Promise<User> => {
      const sanitized = {
        email: sanitizeInput(data.email),
        password: data.password,
        full_name: sanitizeInput(data.full_name),
        company_name: sanitizeInput(data.company_name),
      };
      return request<User>('/auth/signup', { method: 'POST', body: JSON.stringify(sanitized) });
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
    list: (): Promise<Guard[]> => request<Guard[]>('/guards'),
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
    list: (params?: { guard_id?: number; site_id?: number; start_date?: string; end_date?: string }): Promise<Assignment[]> => {
      const query = new URLSearchParams();
      if (params?.guard_id) query.append('guard_id', params.guard_id.toString());
      if (params?.site_id) query.append('site_id', params.site_id.toString());
      if (params?.start_date) query.append('start_date', params.start_date);
      if (params?.end_date) query.append('end_date', params.end_date);
      return request<Assignment[]>(`/assignments?${query.toString()}`);
    },
    rota: (params?: { start_date?: string; end_date?: string }): Promise<Rota[]> => {
      const query = new URLSearchParams();
      if (params?.start_date) query.append('start_date', params.start_date);
      if (params?.end_date) query.append('end_date', params.end_date);
      return request<Rota[]>(`/assignments/rota?${query.toString()}`);
    },
    create: (data: Omit<Assignment, 'id' | 'created_at'>): Promise<Assignment> => {
      return request<Assignment>('/assignments', { method: 'POST', body: JSON.stringify(data) });
    },
    update: (id: number, data: Partial<Omit<Assignment, 'id' | 'created_at'>>): Promise<Assignment> => {
      return request<Assignment>(`/assignments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete: (id: number): Promise<void> => request<void>(`/assignments/${id}`, { method: 'DELETE' }),
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
  },
  subContractors: {
    list: (): Promise<SubContractor[]> => request<SubContractor[]>('/sub-contractors'),
    get: (id: number): Promise<SubContractor> => request<SubContractor>(`/sub-contractors/${id}`),
    create: (data: Omit<SubContractor, 'id' | 'company_id' | 'created_at'>): Promise<SubContractor> => {
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
    dashboard: (): Promise<DashboardStats> => request<DashboardStats>('/reports/dashboard'),
    compliance: (days?: number): Promise<ComplianceAlert[]> => request<ComplianceAlert[]>(`/reports/compliance${days != null ? `?days=${days}` : ''}`),
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
    create: (data: Partial<Invoice>): Promise<Invoice> => request<Invoice>('/invoices', { method: 'POST', body: JSON.stringify(data) }),
    generate: (client_id: number, period_start: string, period_end: string): Promise<Invoice> =>
      request<Invoice>(`/invoices/generate?client_id=${client_id}&period_start=${period_start}&period_end=${period_end}`, { method: 'POST' }),
    updateStatus: (id: number, status: string): Promise<Invoice> => request<Invoice>(`/invoices/${id}/status?status=${encodeURIComponent(status)}`, { method: 'PATCH' }),
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
  admin: {
    companies: (): Promise<import('./types').Company[]> => request<import('./types').Company[]>('/admin/companies'),
  },
};

export { ApiError };
