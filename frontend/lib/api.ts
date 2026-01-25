import type { User, Guard, Site, Assignment, Rota, LoginResponse } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  
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
};

export { ApiError };
