'use client';

/** Cloudflare Turnstile site key. Blank = widget hidden and no header sent (backend also disabled). */
export const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim();

const RESET_EVENT = 'controlops-turnstile-reset';
let pendingToken: string | null = null;

export function setTurnstileToken(token: string | null) {
  pendingToken = token;
}

/**
 * Header for the next auth request. Turnstile tokens are single-use, so reading one
 * clears it and asks the widget to issue a fresh challenge for any retry.
 */
export function consumeTurnstileHeader(): Record<string, string> {
  if (!TURNSTILE_SITE_KEY || !pendingToken) return {};
  const token = pendingToken;
  pendingToken = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RESET_EVENT));
  return { 'X-Turnstile-Token': token };
}

export const TURNSTILE_RESET_EVENT = RESET_EVENT;
