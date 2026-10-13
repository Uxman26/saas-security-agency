import { SITE_URL } from '@/lib/site';

export function SiteJsonLd() {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'ControlOps',
    url: SITE_URL,
    logo: `${SITE_URL}/ControlOps-Logos/controlOps-horizontal-logo.png`,
    email: 'info@controlops.co.uk',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'GB',
    },
    sameAs: [
      'https://www.linkedin.com/showcase/control-operations',
      'https://www.facebook.com/people/Control-Operations/61591486731565/',
    ],
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ControlOps',
    url: SITE_URL,
    publisher: { '@type': 'Organization', name: 'ControlOps', url: SITE_URL },
  };

  const software = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'ControlOps',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description:
      'Workforce operations and rota management software for multi-site service businesses in the UK.',
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/pricing`,
      priceCurrency: 'GBP',
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(software) }} />
    </>
  );
}
