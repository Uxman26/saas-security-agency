import type { PlanTier } from './types';

const TIER_DISPLAY: Record<string, { name: string; description: string; highlighted?: boolean; extras: string[] }> = {
  basic: {
    name: 'Basic',
    description: 'For small teams getting started.',
    extras: ['Sites & assignments', 'Rota view', 'Payroll & invoices', 'Compliance alerts'],
  },
  standard: {
    name: 'Standard',
    description: 'For growing security companies.',
    highlighted: true,
    extras: ['Everything in Basic', 'Clients & sub-contractors', 'Allowances & rates', 'Dashboard stats'],
  },
  premium: {
    name: 'Premium',
    description: 'For larger operations.',
    extras: ['Everything in Standard', 'Priority support', 'Custom reporting', 'API access'],
  },
  enterprise: {
    name: 'Enterprise',
    description: 'For national-scale operations.',
    extras: ['Everything in Premium', 'Sub-contractor module', 'Dedicated support', 'Custom SLAs'],
  },
};

export function guardLabel(max: number | null | undefined) {
  return max != null ? `Up to ${max} guards` : 'Unlimited guards';
}

export function siteLabel(max: number | null | undefined) {
  return max != null ? `Up to ${max} sites` : 'Unlimited sites';
}

export function planFeatures(tier: PlanTier): string[] {
  const meta = TIER_DISPLAY[tier.tier];
  const lines = [guardLabel(tier.max_guards)];
  if (meta) lines.push(...meta.extras);
  return lines;
}

export function planDisplay(tier: PlanTier) {
  const meta = TIER_DISPLAY[tier.tier];
  return {
    name: meta?.name ?? tier.tier.charAt(0).toUpperCase() + tier.tier.slice(1),
    description: meta?.description ?? '',
    highlighted: meta?.highlighted ?? false,
  };
}

export function formatPriceGBP(price: number) {
  return `£${Number.isInteger(price) ? price : price.toFixed(2)}`;
}

export const DEFAULT_PLAN_TIERS: PlanTier[] = [
  { tier: 'basic', price_gbp: 29, max_guards: 10, max_sites: 5, max_users: 5, features: { subcontractors: false, extended_reports: false, contractors: false, sub_contractors: false, sms: false, email: true } },
  { tier: 'standard', price_gbp: 79, max_guards: 50, max_sites: 25, max_users: 15, features: { subcontractors: true, extended_reports: false, contractors: false, sub_contractors: false, sms: true, email: true } },
  { tier: 'premium', price_gbp: 149, max_guards: null, max_sites: null, max_users: 50, features: { subcontractors: true, extended_reports: true, contractors: true, sub_contractors: false, sms: true, email: true } },
  { tier: 'enterprise', price_gbp: 299, max_guards: null, max_sites: null, max_users: null, features: { subcontractors: true, extended_reports: true, contractors: true, sub_contractors: true, sms: true, email: true } },
];
