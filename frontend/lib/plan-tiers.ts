import type { PlanTier } from './types';

type TFn = (key: string, values?: Record<string, string | number>) => string;
type TRaw = { raw: (key: string) => unknown };

const HIGHLIGHTED = new Set(['standard']);

export function planFeatures(tier: PlanTier, t: TFn, tr: TRaw): string[] {
  const tierKey = tier.tier;
  const lines = [
    tier.max_guards != null ? t('workersLimited', { max: tier.max_guards }) : t('workersUnlimited'),
    tier.max_users != null ? t('usersLimited', { max: tier.max_users }) : t('usersUnlimited'),
  ];
  const extras = tr.raw(`${tierKey}.extras`) as string[] | undefined;
  if (extras?.length) lines.push(...extras);
  return lines;
}

export function planDetails(tier: PlanTier, t: TFn) {
  const support =
    tier.tier === 'enterprise' ? t('supportDedicated') : tier.tier === 'premium' ? t('supportPriority') : t('supportStandard');
  return {
    billing: t('billing'),
    vat: t('vat'),
    support,
    setup: t('setup'),
    contract: t('contract'),
    cancellation: t('cancellation'),
    trial: t('trial'),
    changes: t('changes'),
  };
}

export function planDisplay(tier: PlanTier, t: TFn) {
  const tierKey = tier.tier;
  return {
    name: t(`${tierKey}.name`),
    description: t(`${tierKey}.description`),
    highlighted: HIGHLIGHTED.has(tierKey),
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
