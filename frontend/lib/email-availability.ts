import { api } from '@/lib/api';

export const DUPLICATE_EMAIL_MESSAGE =
  'This email address is already registered. Please use a different email.';

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function assertEmailAvailable(
  email: string,
  options?: { excludeUserId?: number }
): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) return null;
  try {
    const res = await api.auth.checkEmail(normalized, options?.excludeUserId);
    if (res.available) return null;
    return res.message || DUPLICATE_EMAIL_MESSAGE;
  } catch {
    return null;
  }
}

export function isDuplicateEmailError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message || '';
  return (
    msg.includes('already registered') ||
    msg.includes(DUPLICATE_EMAIL_MESSAGE) ||
    msg.toLowerCase().includes('email address is already')
  );
}
