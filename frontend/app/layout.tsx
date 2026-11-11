import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/lib/providers';
import { NextIntlClientProvider } from 'next-intl';
import { isRtl } from '@/i18n/config';
import { SiteJsonLd } from '@/components/marketing/site-json-ld';
import { THEME_INIT_SCRIPT } from '@/lib/user-theme';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

/** Without this, mobile browsers assume a ~980px canvas and shrink every page to fit.
 *  User scaling stays enabled deliberately — capping zoom locks out low-vision users. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8FAFC' },
    { media: '(prefers-color-scheme: dark)', color: '#0F172A' },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://controlops.co.uk'),
    title: {
      default: t('title'),
      template: '%s | Control Operations',
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
    openGraph: {
      type: 'website',
      locale: 'en_GB',
      siteName: 'ControlOps',
      title: t('title'),
      description: t('description'),
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
    <html lang={locale} dir={dir} className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Apply saved theme before first paint — prevents light flash on dark refresh. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans text-base antialiased">
        <SiteJsonLd />
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
