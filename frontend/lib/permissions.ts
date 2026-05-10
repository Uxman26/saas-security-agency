import type { User } from './types';

export const PERMS = {
  contractorView: 'contractor:view',
  contractorManage: 'contractor:manage',
  contractorAssign: 'contractor:assign',
} as const;

export function can(user: User | null | undefined, code: string): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return Array.isArray(user.permissions) && user.permissions.includes(code);
}
