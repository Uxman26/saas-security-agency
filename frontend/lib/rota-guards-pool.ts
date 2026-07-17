import type { Guard } from './types';
import type { EmployeeRec } from './rota-shifts-types';
import { AVATAR_PALETTE } from './rota-shifts-types';

export function guardToEmployee(g: Guard, i: number): EmployeeRec {
  return {
    id: String(g.id),
    name: g.full_name,
    role: g.job_title || 'Staff',
    avatarColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length],
    phone: g.phone || g.work_phone || undefined,
    photoUrl: g.photo_url ?? null,
  };
}

export function guardsToEmployees(guards: Guard[]): EmployeeRec[] {
  return guards.map((g, i) => guardToEmployee(g, i));
}
