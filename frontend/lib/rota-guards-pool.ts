import type { Guard } from './types';
import type { EmployeeRec } from './rota-shifts-types';
import { AVATAR_PALETTE } from './rota-shifts-types';

const HOURLY = /hour|\bhr\b|\bp\/?h\b/i;

export function profileHourlyRate(g: Pick<Guard, 'salary_amount' | 'salary_rate'>): number | null {
  const amount = Number(g.salary_amount);
  if (!amount || Number.isNaN(amount) || amount <= 0) return null;
  return HOURLY.test(g.salary_rate || '') ? amount : null;
}

export function guardToEmployee(g: Guard, i: number): EmployeeRec {
  return {
    id: String(g.id),
    name: g.full_name,
    role: g.job_title || 'Staff',
    avatarColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length],
    phone: g.phone || g.work_phone || undefined,
    photoUrl: g.photo_url ?? null,
    hourlyRate: profileHourlyRate(g),
  };
}

export function guardsToEmployees(guards: Guard[]): EmployeeRec[] {
  return guards.map((g, i) => guardToEmployee(g, i));
}
