/** Dial codes and phone helpers for staff contact fields. Stored value is E.164-ish: +{dial}{national}. */

export type CountryDial = {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  dial: string; // without +
  nationalLength: number; // expected digit count after dial code
  /** Drop a leading 0 from national numbers when composing E.164 (UK mobiles). */
  dropLeadingZero?: boolean;
};

export const PHONE_COUNTRIES: CountryDial[] = [
  { code: 'GB', name: 'United Kingdom', dial: '44', nationalLength: 10, dropLeadingZero: true },
  { code: 'IE', name: 'Ireland', dial: '353', nationalLength: 9, dropLeadingZero: true },
  { code: 'US', name: 'United States', dial: '1', nationalLength: 10 },
  { code: 'CA', name: 'Canada', dial: '1', nationalLength: 10 },
  { code: 'AE', name: 'United Arab Emirates', dial: '971', nationalLength: 9, dropLeadingZero: true },
  { code: 'SA', name: 'Saudi Arabia', dial: '966', nationalLength: 9, dropLeadingZero: true },
  { code: 'PK', name: 'Pakistan', dial: '92', nationalLength: 10, dropLeadingZero: true },
  { code: 'IN', name: 'India', dial: '91', nationalLength: 10 },
  { code: 'NG', name: 'Nigeria', dial: '234', nationalLength: 10, dropLeadingZero: true },
  { code: 'AU', name: 'Australia', dial: '61', nationalLength: 9, dropLeadingZero: true },
  { code: 'DE', name: 'Germany', dial: '49', nationalLength: 11, dropLeadingZero: true },
  { code: 'FR', name: 'France', dial: '33', nationalLength: 9, dropLeadingZero: true },
  { code: 'ES', name: 'Spain', dial: '34', nationalLength: 9 },
  { code: 'IT', name: 'Italy', dial: '39', nationalLength: 10 },
  { code: 'NL', name: 'Netherlands', dial: '31', nationalLength: 9, dropLeadingZero: true },
  { code: 'PL', name: 'Poland', dial: '48', nationalLength: 9 },
  { code: 'RO', name: 'Romania', dial: '40', nationalLength: 9, dropLeadingZero: true },
  { code: 'PT', name: 'Portugal', dial: '351', nationalLength: 9 },
  { code: 'BD', name: 'Bangladesh', dial: '880', nationalLength: 10, dropLeadingZero: true },
  { code: 'PH', name: 'Philippines', dial: '63', nationalLength: 10, dropLeadingZero: true },
];

export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES[0]; // GB +44

export function digitsOnly(value: string): string {
  return (value || '').replace(/\D/g, '');
}

export function composePhone(dial: string, national: string, dropLeadingZero?: boolean): string {
  let n = digitsOnly(national);
  if (dropLeadingZero && n.startsWith('0')) n = n.slice(1);
  if (!n) return '';
  return `+${digitsOnly(dial)}${n}`;
}

export function parseStoredPhone(stored: string | null | undefined): {
  country: CountryDial;
  national: string;
} {
  const raw = (stored || '').trim();
  if (!raw) {
    return { country: DEFAULT_PHONE_COUNTRY, national: '' };
  }
  const digits = digitsOnly(raw.startsWith('+') ? raw : raw);
  // Longest dial match first
  const sorted = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (digits.startsWith(c.dial) && digits.length > c.dial.length) {
      return { country: c, national: digits.slice(c.dial.length) };
    }
  }
  // Local number without country — assume default country
  return { country: DEFAULT_PHONE_COUNTRY, national: digits };
}

export function validatePhoneValue(
  stored: string,
  required = false
): { ok: boolean; message?: string } {
  const v = (stored || '').trim();
  if (!v) {
    if (required) return { ok: false, message: 'Phone number is required' };
    return { ok: true };
  }
  if (!v.startsWith('+')) {
    return { ok: false, message: 'Select a country code and enter a valid number' };
  }
  const { country, national } = parseStoredPhone(v);
  const n = digitsOnly(national);
  if (!n) return { ok: false, message: 'Enter the phone number' };
  if (!/^\d+$/.test(n)) return { ok: false, message: 'Phone number must be digits only' };
  // Allow slight variance (±1) for some countries, but enforce a sensible band
  const min = Math.max(6, country.nationalLength - 1);
  const max = country.nationalLength + 1;
  if (n.length < min || n.length > max) {
    return {
      ok: false,
      message: `Enter ${country.nationalLength} digits for ${country.name} (+${country.dial})`,
    };
  }
  return { ok: true };
}
