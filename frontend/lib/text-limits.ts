/**
 * Single source of truth for how long free-text values may be.
 *
 * `Input` and `Textarea` fall back to `text` / `longText` when no `maxLength` is
 * given, so a field can never end up unbounded just because a limit was
 * forgotten. Pass a named limit below when a field needs something tighter, and
 * mirror it in the zod schema (lib/validation.ts) so submits are checked too.
 */
export const TEXT_LIMITS = {
  /** Fallback for single-line inputs — matches a typical varchar(255) column. */
  text: 255,
  /** Fallback for multi-line inputs. */
  longText: 5000,
  /** Site / location names have to stay readable inside a rota cell. */
  siteName: 40,
  name: 80,
  companyName: 100,
  title: 120,
  email: 254,
  phone: 32,
  url: 2048,
  postcode: 20,
  address: 200,
  reference: 200,
  /** Short identifiers: badge, SIA, share code, registration number. */
  code: 50,
  note: 2000,
} as const;

/** Trims a value to `limit` characters. For values that don't come from a capped input. */
export function clampText(value: string | null | undefined, limit: number): string {
  const v = value ?? '';
  return v.length > limit ? v.slice(0, limit) : v;
}

export function isWithinLimit(value: string | null | undefined, limit: number): boolean {
  return (value ?? '').length <= limit;
}

/** Characters still available, never negative. */
export function charsRemaining(value: string | null | undefined, limit: number): number {
  return Math.max(0, limit - (value ?? '').length);
}

/** Shared wording so every form reports an over-long value the same way. */
export function tooLongMessage(label: string, limit: number): string {
  return `${label} must be ${limit} characters or fewer`;
}
