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
        { url: '/ControlOps-Logos/favicon_io/favicon.ico', sizes: 'any' },
        { url: '/ControlOps-Logos/favicon_io/favicon-16x16.avif', sizes: '16x16', type: 'image/avif' },
        { url: '/ControlOps-Logos/favicon_io/favicon-32x32.avif', sizes: '32x32', type: 'image/avif' },
      ],
      apple: '/ControlOps-Logos/favicon_io/apple-touch-icon.avif',
      shortcut: '/ControlOps-Logos/favicon_io/favicon.ico',
    },
    manifest: '/ControlOps-Logos/favicon_io/site.webmanifest',
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
