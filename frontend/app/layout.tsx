import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';
import { NextIntlClientProvider } from 'next-intl';
import { isRtl } from '@/i18n/config';

/** Without this, mobile browsers assume a ~980px canvas and shrink every page to fit.
 *  User scaling stays enabled deliberately — capping zoom locks out low-vision users. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

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
        { url: '/ControlOps-Logos/favicon_io/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/ControlOps-Logos/favicon_io/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      ],
      apple: '/ControlOps-Logos/favicon_io/apple-touch-icon.png',
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
