import type { PlanTier } from './types';
import { DEFAULT_PLAN_TIERS } from './plan-tiers';

/**
 * Tenant module switches offered by the super-admin panel. Must stay in step with the
 * API's module_service.TENANT_MODULES — a key listed only here saves a 200 and reads
 * back unticked forever.
 */
export const TENANT_MODULE_KEYS = [
  'expenses',
  'whatsapp',
  'email',
  'mobile_apps',
  'leads',
  'lead_capture',
  'landing_pages',
  'barcode_generator',
  'client_portal',
  'api_access',
] as const;

export const MODULE_LABELS: Record<string, string> = {
  expenses: 'Expenses',
  whatsapp: 'WhatsApp',
  email: 'Email',
  mobile_apps: 'Mobile Apps',
  leads: 'Lead Management',
  lead_capture: 'Lead Capture',
  landing_pages: 'Landing Pages',
  barcode_generator: 'Barcode Generator',
  client_portal: 'Client Portal',
  api_access: 'API Access',
};

export const MODULE_DESCRIPTIONS: Record<string, string> = {
  expenses: 'Staff expense claims and approval',
  whatsapp: 'Twilio SMS and WhatsApp messaging',
  email: 'Transactional and bulk email',
  mobile_apps: 'Staff mobile clock-in and patrol apps',
  leads: 'Lead pipeline, follow-ups and meetings',
  lead_capture: 'Public capture forms and inbound lead routing',
  landing_pages: 'Hosted landing pages for campaigns and sign-ups',
  barcode_generator: 'Barcode / QR tags for sites and assets',
  client_portal: 'Client logins for sites, requests and reports',
  api_access: 'REST API tokens for third-party integrations',
};

/** Mirrors the API's feature_catalog.FEATURE_TO_MODULE: plan feature -> tenant module. */
const FEATURE_TO_MODULE: Record<string, string> = {
  expenses: 'expenses',
  sms: 'whatsapp',
  email: 'email',
  mobile_apps: 'mobile_apps',
  leads: 'leads',
  lead_capture: 'lead_capture',
  landing_pages: 'landing_pages',
  barcode_generator: 'barcode_generator',
  client_portal: 'client_portal',
  api_access: 'api_access',
};

const DEFAULT_MODULES: Record<string, boolean> = {
  expenses: true,
  whatsapp: true,
  email: true,
  mobile_apps: true,
  leads: true,
  lead_capture: false,
  landing_pages: false,
  barcode_generator: false,
  client_portal: true,
  api_access: false,
};

export function modulesFromPlan(tier: PlanTier): Record<string, boolean> {
  const feats = tier.features || {};
  const out = { ...DEFAULT_MODULES };
  for (const [featureKey, moduleKey] of Object.entries(FEATURE_TO_MODULE)) {
    if (featureKey in feats) out[moduleKey] = !!feats[featureKey];
  }
  return out;
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
