'use server';

import { cookies } from 'next/headers';
import { locales } from '@/i18n/config';

export async function setLocale(locale: string) {
  if (!locales.includes(locale as (typeof locales)[number])) return;
  const store = await cookies();
  store.set('locale', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 });
}
