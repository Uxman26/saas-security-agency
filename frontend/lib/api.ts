const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }

  return response.json();
}

export const api = {
  auth: {
    signup: (data: { email: string; password: string; full_name: string; company_name: string }) =>
      request('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<{ access_token: string; token_type: string }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request('/auth/me'),
  },
  guards: {
    list: () => request('/guards'),
    get: (id: number) => request(`/guards/${id}`),
    create: (data: any) => request('/guards', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request(`/guards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request(`/guards/${id}`, { method: 'DELETE' }),
  },
  sites: {
    list: () => request('/sites'),
    get: (id: number) => request(`/sites/${id}`),
    create: (data: any) => request('/sites', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request(`/sites/${id}`, { method: 'DELETE' }),
  },
  assignments: {
    list: (params?: { guard_id?: number; site_id?: number; start_date?: string; end_date?: string }) => {
      const query = new URLSearchParams();
      if (params?.guard_id) query.append('guard_id', params.guard_id.toString());
      if (params?.site_id) query.append('site_id', params.site_id.toString());
      if (params?.start_date) query.append('start_date', params.start_date);
      if (params?.end_date) query.append('end_date', params.end_date);
      return request(`/assignments?${query.toString()}`);
    },
    rota: (params?: { start_date?: string; end_date?: string }) => {
      const query = new URLSearchParams();
      if (params?.start_date) query.append('start_date', params.start_date);
      if (params?.end_date) query.append('end_date', params.end_date);
      return request(`/assignments/rota?${query.toString()}`);
    },
    create: (data: any) => request('/assignments', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request(`/assignments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request(`/assignments/${id}`, { method: 'DELETE' }),
  },
};
