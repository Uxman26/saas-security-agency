import type { Guard } from './types';
import type { EmployeeRec } from './rota-shifts-types';
import { AVATAR_PALETTE } from './rota-shifts-types';

const HOURLY = /hour|\bhr\b|\bp\/?h\b/i;

/** Mirrors backend rate_service.salaried_hourly_rate. */
function salariedHourlyRate(
  g: Pick<
    Guard,
    | 'salary_amount'
    | 'salary_frequency'
    | 'pay_frequency'
    | 'weekly_contracted_hours'
    | 'contracted_week_hrs'
    | 'contracted_week_mins'
  >
): number | null {
  const salary = Number(g.salary_amount);
  if (!salary || Number.isNaN(salary) || salary <= 0) return null;
  let weekly = Number(g.weekly_contracted_hours);
  if (!weekly || Number.isNaN(weekly) || weekly <= 0) {
    const hrs = Number(g.contracted_week_hrs) || 0;
    const mins = Number(g.contracted_week_mins) || 0;
    weekly = hrs + mins / 60;
  }
  if (!weekly || weekly <= 0) return null;
  const freq = String(g.salary_frequency || g.pay_frequency || 'annual').toLowerCase();
  const annual = freq.includes('week') ? salary * 52 : freq.includes('month') ? salary * 12 : salary;
  return Math.round((annual / (weekly * 52)) * 10000) / 10000;
}

/**
 * Employment Details → effective hourly rate for rota autofill.
 * Mirrors backend rate_service.profile_hourly_rate.
 */
export function profileHourlyRate(
  g: Pick<
    Guard,
    | 'employment_pay_type'
    | 'pay_method'
    | 'hourly_rate'
    | 'salary_amount'
    | 'salary_rate'
    | 'salary_frequency'
    | 'pay_frequency'
    | 'weekly_contracted_hours'
    | 'contracted_week_hrs'
    | 'contracted_week_mins'
  >
): number | null {
  const payType = String(g.employment_pay_type || '').trim().toLowerCase();
  const method = String(g.pay_method || '').trim().toLowerCase();
  if (payType === 'salaried') return salariedHourlyRate(g);
  if (method === 'per_job') return null;
  const hr = Number(g.hourly_rate);
  if (hr && !Number.isNaN(hr) && hr > 0) return hr;
  const amount = Number(g.salary_amount);
  if (!amount || Number.isNaN(amount) || amount <= 0) return null;
  return HOURLY.test(g.salary_rate || '') ? amount : null;
}

/** Rate locked onto a shift — hourly profile, or per-job rate when configured. */
export function profileShiftRate(
  g: Pick<
    Guard,
    | 'employment_pay_type'
    | 'pay_method'
    | 'hourly_rate'
    | 'per_job_rate'
    | 'salary_amount'
    | 'salary_rate'
    | 'salary_frequency'
    | 'pay_frequency'
    | 'weekly_contracted_hours'
    | 'contracted_week_hrs'
    | 'contracted_week_mins'
  >
): number | null {
  const payType = String(g.employment_pay_type || '').trim().toLowerCase();
  const method = String(g.pay_method || '').trim().toLowerCase();
  if (payType === 'non_salaried' && method === 'per_job') {
    const job = Number(g.per_job_rate);
    if (!Number.isNaN(job) && job >= 0) return job;
    return null;
  }
  return profileHourlyRate(g);
}

export function guardToEmployee(g: Guard, i: number): EmployeeRec {
  return {
    id: String(g.id),
    name: g.full_name,
    role: g.job_title || 'Staff',
    avatarColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length],
    phone: g.phone || g.work_phone || undefined,
    photoUrl: g.photo_url ?? null,
    hourlyRate: profileShiftRate(g),
  };
}

export function guardsToEmployees(guards: Guard[]): EmployeeRec[] {
  return guards.map((g, i) => guardToEmployee(g, i));
}
