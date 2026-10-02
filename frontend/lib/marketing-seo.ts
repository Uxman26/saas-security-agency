import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';

const abs = (title: string, description: string, path = '/'): Metadata => {
  const url = `${SITE_URL}${path === '/' ? '' : path}`;
  return {
    title: { absolute: title },
    description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'en_GB',
      url,
      siteName: 'ControlOps',
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
};

export const homeMetadata = abs(
  'Workforce Operations & Rota Management Software | ControlOps',
  'Manage employees, contractors, rotas, client sites, workforce records, payroll preparation and billing with ControlOps.',
  '/'
);

export const aboutMetadata = abs(
  'About ControlOps | Workforce Operations Software',
  'Learn how ControlOps helps shift-based service businesses manage workforces, rotas, sites, operational records, payroll preparation and billing.',
  '/about'
);

export const pricingMetadata = abs(
  'ControlOps Pricing | Workforce and Rota Software Plans',
  'Compare ControlOps plans for workforce management, rota scheduling, operational records, payroll preparation and client invoicing.',
  '/pricing'
);

export const bookDemoMetadata = abs(
  'Book a ControlOps Demo',
  'Book a tailored demonstration of ControlOps workforce, rota, records, payroll and billing workflows.',
  '/book-demo'
);

export const platformMetadata = abs(
  'ControlOps Platform | Workforce Operations Software',
  'Workforce management, rotas, sites, records, rates, payroll preparation and client invoicing in one operational platform.',
  '/platform'
);

export const industriesMetadata = abs(
  'Industries | ControlOps',
  'ControlOps for security, cleaning, facilities, event staffing, temporary staffing and other multi-site service businesses.',
  '/industries'
);

export const securityIndustryMetadata = abs(
  'Security Workforce Management Software UK | ControlOps',
  'Manage guards, sites, rotas, SIA records, subcontractors, payroll information and client invoices with ControlOps.',
  '/industries/security'
);

export const cleaningIndustryMetadata = abs(
  'Cleaning & Facilities Workforce Software | ControlOps',
  'Schedule cleaning and facilities teams across client locations while managing workforce records, rates, payroll preparation and billing.',
  '/industries/cleaning-facilities'
);

export const eventIndustryMetadata = abs(
  'Event Staffing & Rota Management Software | ControlOps',
  'Organise temporary workers, venues, assignments, documents, rates, payroll information and client billing.',
  '/industries/event-staffing'
);

export const staffingIndustryMetadata = abs(
  'Temporary Staffing Operations Software | ControlOps',
  'Manage workers, client assignments, pay and charge rates, payroll preparation and invoices in one operational platform.',
  '/industries/temporary-staffing'
);

export const privacyMetadata = abs(
  'Privacy Notice | ControlOps',
  'How ControlOps collects, uses and protects personal data for its UK workforce operations website and SaaS platform.',
  '/privacy'
);

export const termsMetadata = abs(
  'Terms of Service | ControlOps',
  'Terms governing use of the ControlOps workforce operations SaaS platform and public website for UK business customers.',
  '/terms'
);

export const cookiesMetadata = abs(
  'Cookie Policy | ControlOps',
  'How ControlOps uses cookies and similar technologies on controlops.co.uk and the ControlOps Service.',
  '/cookies'
);

export const contactMetadata = abs(
  'Contact | ControlOps',
  'Contact ControlOps for demos, sales questions and support for workforce operations software.',
  '/contact'
);

export const helpMetadata = abs(
  'Help Centre | ControlOps',
  'Guides for ControlOps: getting started, rotas, payroll, invoicing, settings, FAQ, and how to contact support.',
  '/help'
);

export const securityPageMetadata = abs(
  'Security | ControlOps',
  'How ControlOps approaches application security, access control and operational safeguards.',
  '/security'
);

export const dpaMetadata = abs(
  'Data Processing Agreement | ControlOps',
  'Data Processing Agreement for ControlOps SaaS customers processing personal data in the UK.',
  '/dpa'
);

export const accessibilityMetadata = abs(
  'Accessibility Statement | ControlOps',
  'Accessibility statement for the ControlOps public website and SaaS application.',
  '/accessibility'
);

export const noIndexFollow: Metadata = {
  robots: { index: false, follow: true },
};
