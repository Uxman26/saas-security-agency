import type { PlanTier } from './types';
import { DEFAULT_PLAN_TIERS } from './plan-tiers';

export const TENANT_MODULE_KEYS = ['expenses', 'whatsapp', 'email', 'mobile_apps', 'leads'] as const;

export const MODULE_LABELS: Record<string, string> = {
  expenses: 'Expenses',
  whatsapp: 'WhatsApp',
  email: 'Email',
  mobile_apps: 'Mobile Apps',
  leads: 'Lead Management',
};

const DEFAULT_MODULES: Record<string, boolean> = {
  expenses: true,
  whatsapp: true,
  email: true,
  mobile_apps: true,
  leads: false,
};

export function modulesFromPlan(tier: PlanTier): Record<string, boolean> {
  const feats = tier.features || {};
  return {
    ...DEFAULT_MODULES,
    whatsapp: !!feats.sms,
    email: feats.email !== false,
  };
}

export function planDefaultsForCompany(tier: PlanTier) {
  return {
    max_users: tier.max_users != null ? String(tier.max_users) : '',
    modules: modulesFromPlan(tier),
    max_guards: tier.max_guards,
    max_sites: tier.max_sites,
    price_gbp: tier.price_gbp,
  };
}

export function findPlanTier(tier: string, packages: PlanTier[]): PlanTier | undefined {
  return packages.find((p) => p.tier === tier) ?? DEFAULT_PLAN_TIERS.find((p) => p.tier === tier);
}

export function formatPlanLimit(n: number | null | undefined) {
  return n == null ? 'Unlimited' : String(n);
}
