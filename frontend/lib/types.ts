export interface User {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface Company {
  id: number;
  name: string;
  admin_id: number;
  created_at: string;
}

export interface Guard {
  id: number;
  company_id: number;
  full_name: string;
  email?: string;
  phone?: string;
  badge_number?: string;
  license_number?: string;
  address?: string;
  created_at: string;
}

export interface Site {
  id: number;
  company_id: number;
  name: string;
  address?: string;
  contact_person?: string;
  contact_phone?: string;
  created_at: string;
}

export interface Assignment {
  id: number;
  guard_id: number;
  site_id: number;
  date: string;
  shift_start?: string;
  shift_end?: string;
  created_at: string;
}

export interface Rota {
  guard_id: number;
  guard_name: string;
  site_id: number;
  site_name: string;
  date: string;
  shift_start?: string;
  shift_end?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface Client {
  id: number;
  company_id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contact_person?: string;
  created_at: string;
}

export interface SubContractor {
  id: number;
  company_id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contact_person?: string;
  license_number?: string;
  created_at: string;
}
