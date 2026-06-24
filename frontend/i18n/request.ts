import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, locales } from './config';

export default getRequestConfig(async () => {
  const store = await cookies();
  let locale = store.get('locale')?.value || defaultLocale;
  if (!locales.includes(locale as (typeof locales)[number])) locale = defaultLocale;
  const base = (await import(`../messages/${locale}.json`)).default;
  let extra: Record<string, unknown> = {};
  try {
    extra = (await import(`../messages/pages-${locale}.json`)).default;
  } catch {
    extra = {};
  }
  const em = (extra.marketing ?? {}) as Record<string, unknown>;
  const bm = (base.marketing ?? {}) as Record<string, unknown>;
  return {
    locale,
    messages: {
      ...base,
      ...extra,
      auth: { ...base.auth, ...(extra.auth as object) },
      payment: { ...base.payment, ...(extra.payment as object) },
      verify: { ...base.verify, ...(extra.verify as object) },
      marketing: { ...bm, ...em },
    },
  };
});
