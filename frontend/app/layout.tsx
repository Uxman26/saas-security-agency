import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';
import { NextIntlClientProvider } from 'next-intl';
import { isRtl } from '@/i18n/config';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: {
      default: t('title'),
      template: '%s | ControlOps',
    },
    description: t('description'),
    icons: {
      icon: [
        { url: '/ControlOps-Logos/controlOps-icon.png', type: 'image/png', sizes: '512x512' },
        { url: '/ControlOps-Logos/controlOps-icon-192.png', type: 'image/png', sizes: '192x192' },
      ],
      apple: '/ControlOps-Logos/controlOps-icon.png',
      shortcut: '/ControlOps-Logos/controlOps-icon.png',
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = isRtl(locale) ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
