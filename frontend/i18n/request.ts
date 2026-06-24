import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, locales } from './config';

export default getRequestConfig(async () => {
  const store = await cookies();
  let locale = store.get('locale')?.value || defaultLocale;
  if (!locales.includes(locale as (typeof locales)[number])) locale = defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
