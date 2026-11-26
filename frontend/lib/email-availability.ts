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

/** Shown when a login is linked to one the person already has at another company. */
export const LINKED_EXISTING_LOGIN_MESSAGE =
  'This person already has a ControlOps login at another company. It is now linked here too and keeps its existing password — the password you entered was not used.';

/** The server's own duplicate wording (it says "mobile number" for a phone login). */
export function duplicateErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  return msg && isDuplicateEmailError(err) ? msg : DUPLICATE_EMAIL_MESSAGE;
}

export function isDuplicateEmailError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message || '';
  return (
    msg.includes('already registered') ||
    msg.includes('mobile number is already') ||
    msg.includes('already has a login for this company') ||
    msg.includes(DUPLICATE_EMAIL_MESSAGE) ||
    msg.toLowerCase().includes('email address is already')
  );
}
