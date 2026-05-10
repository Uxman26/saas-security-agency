import type { Guard } from './types';
import type { EmployeeRec } from './rota-shifts-types';
import { AVATAR_PALETTE } from './rota-shifts-types';

export function guardToEmployee(g: Guard, i: number): EmployeeRec {
  return {
    id: String(g.id),
    name: g.full_name,
    role: 'Guard',
    avatarColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length],
  };
}

export function guardsToEmployees(guards: Guard[]): EmployeeRec[] {
  return guards.map((g, i) => guardToEmployee(g, i));
}
