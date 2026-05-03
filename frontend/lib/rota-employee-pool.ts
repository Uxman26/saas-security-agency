import type { EmployeeRec } from './rota-shifts-types';
import { AVATAR_PALETTE } from './rota-shifts-types';

const rows: [string, string][] = [
  ['Adnan Sidhu', 'Door Supervisor'],
  ['Agnelo Rebelo', 'Door Supervisor'],
  ['Ahmad Talal Kareem', 'Supervisor'],
  ['Ahsan Ahsan', 'Operative'],
  ['Aisha Muhammad', 'Receptionist'],
  ['Ali Jama', 'Door Supervisor'],
  ['Dana Sabyrzhan', 'Operative'],
  ['David Vas', 'Door Supervisor'],
  ['Daniyal Khan', 'Guard'],
  ['Faiz Rasool', 'Supervisor'],
];

export const EMPLOYEE_POOL: EmployeeRec[] = rows.map(([name, role], i) => ({
  id: `emp-${i}`,
  name,
  role,
  avatarColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length],
}));
