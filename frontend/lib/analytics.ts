'use client';

import { GA_MEASUREMENT_ID } from '@/lib/site';

export const CONSENT_STORAGE_KEY = 'controlops_cookie_consent';

export type CookieConsent = 'accepted' | 'rejected' | 'unset';

type GtagCommand = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagCommand;
  }
}

const SENSITIVE_KEYS = /password|token|secret|card|cvv|cvc|pan|authorization|api[_-]?key|ssn|ni[_-]?number/i;

function sanitizeParams(params?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (SENSITIVE_KEYS.test(k)) continue;
    if (typeof v === 'string' && /@/.test(v) && v.includes('.')) continue;
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') continue;
    out[k] = v;
  }
  return out;
}

export function readConsent(): CookieConsent {
  if (typeof window === 'undefined') return 'unset';
  try {
    const v = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (v === 'accepted' || v === 'rejected') return v;
  } catch {
    /* ignore */
  }
  return 'unset';
}

export function writeConsent(value: 'accepted' | 'rejected') {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('controlops-consent', { detail: value }));
}

export function hasAnalyticsConsent(): boolean {
  return Boolean(GA_MEASUREMENT_ID) && readConsent() === 'accepted';
}

function ensureGtag() {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
  }
}

export function applyConsentDefaults() {
  ensureGtag();
  window.gtag?.('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500,
  });
}

export function updateConsent(granted: boolean) {
  ensureGtag();
  window.gtag?.('consent', 'update', {
    analytics_storage: granted ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (!hasAnalyticsConsent() || !window.gtag) return;
  window.gtag('event', name, sanitizeParams(params));
}

export function trackPageView(path: string, title?: string) {
  if (!hasAnalyticsConsent() || !GA_MEASUREMENT_ID || !window.gtag) return;
  const page_path = path.split('?')[0] || '/';
  window.gtag('event', 'page_view', {
    page_path,
    page_title: title || document.title,
    page_location: `${window.location.origin}${page_path}`,
  });
  window.gtag('config', GA_MEASUREMENT_ID, {
    page_path,
    send_page_view: false,
  });
}

export const analytics = {
  viewPricing: () => trackEvent('view_item_list', { item_list_id: 'plans', item_list_name: 'Subscription plans' }),
  viewPlan: (tier: string, cycle?: string) =>
    trackEvent('view_item', { item_id: tier, item_name: tier, item_category: 'subscription', billing_cycle: cycle }),
  selectPlan: (tier: string, cycle: string, trial?: boolean) =>
    trackEvent('select_item', {
      item_list_id: 'plans',
      item_id: tier,
      item_name: tier,
      billing_cycle: cycle,
      trial: trial ? 1 : 0,
    }),
  ctaClick: (cta_id: string, location: string) => trackEvent('cta_click', { cta_id, location }),
  signUpStart: (tier?: string) => trackEvent('sign_up_start', { method: 'email', subscription_tier: tier }),
  signUp: (opts: { tier?: string; trial?: boolean; method?: string }) =>
    trackEvent('sign_up', {
      method: opts.method || 'email',
      subscription_tier: opts.tier,
      trial: opts.trial ? 1 : 0,
    }),
  trialStarted: (tier?: string, days?: number) =>
    trackEvent('trial_started', { subscription_tier: tier, trial_days: days }),
  beginCheckout: (tier?: string, value?: number, cycle?: string) =>
    trackEvent('begin_checkout', {
      currency: 'GBP',
      value: typeof value === 'number' ? value : undefined,
      subscription_tier: tier,
      billing_cycle: cycle,
    }),
  purchase: (opts: { tier?: string; value?: number; transaction_id?: string; cycle?: string }) =>
    trackEvent('purchase', {
      currency: 'GBP',
      value: opts.value,
      transaction_id: opts.transaction_id,
      subscription_tier: opts.tier,
      billing_cycle: opts.cycle,
    }),
  paymentFailed: (tier?: string, reason?: string) =>
    trackEvent('payment_failed', { subscription_tier: tier, reason: reason?.slice(0, 80) }),
  checkoutAbandoned: (tier?: string) => trackEvent('checkout_abandoned', { subscription_tier: tier }),
  registrationAbandoned: (tier?: string) => trackEvent('registration_abandoned', { subscription_tier: tier }),
  packageSelectionAbandoned: () => trackEvent('package_selection_abandoned'),
  generateLead: (source = 'book_demo') => trackEvent('generate_lead', { lead_source: source }),
  subscriptionActivated: (tier?: string) => trackEvent('subscription_activated', { subscription_tier: tier }),
  openBillingPortal: () => trackEvent('billing_portal_open'),
  cancelIntent: () => trackEvent('subscription_cancel_intent'),
};
