import type { Metadata } from 'next';

const abs = (title: string, description: string): Metadata => ({
  title: { absolute: title },
  description,
});

export const homeMetadata = abs(
  'Workforce Operations & Rota Management Software | ControlOps',
  'Manage employees, contractors, rotas, client sites, workforce records, payroll preparation and billing with ControlOps.'
);

export const aboutMetadata = abs(
  'About ControlOps | Workforce Operations Software',
  'Learn how ControlOps helps shift-based service businesses manage workforces, rotas, sites, operational records, payroll preparation and billing.'
);

export const pricingMetadata = abs(
  'ControlOps Pricing | Workforce and Rota Software Plans',
  'Compare ControlOps plans for workforce management, rota scheduling, operational records, payroll preparation and client invoicing.'
);

export const bookDemoMetadata = abs(
  'Book a ControlOps Demo',
  'Book a tailored demonstration of ControlOps workforce, rota, records, payroll and billing workflows.'
);

export const platformMetadata = abs(
  'ControlOps Platform | Workforce Operations Software',
  'Workforce management, rotas, sites, records, rates, payroll preparation and client invoicing in one operational platform.'
);

export const industriesMetadata = abs(
  'Industries | ControlOps',
  'ControlOps for security, cleaning, facilities, event staffing, temporary staffing and other multi-site service businesses.'
);

export const securityIndustryMetadata = abs(
  'Security Workforce Management Software UK | ControlOps',
  'Manage guards, sites, rotas, SIA records, subcontractors, payroll information and client invoices with ControlOps.'
);

export const cleaningIndustryMetadata = abs(
  'Cleaning & Facilities Workforce Software | ControlOps',
  'Schedule cleaning and facilities teams across client locations while managing workforce records, rates, payroll information and billing.'
);

export const eventIndustryMetadata = abs(
  'Event Staffing & Rota Management Software | ControlOps',
  'Organise temporary workers, venues, assignments, documents, rates, payroll information and client billing.'
);

export const staffingIndustryMetadata = abs(
  'Temporary Staffing Operations Software | ControlOps',
  'Manage workers, client assignments, pay and charge rates, payroll preparation and invoices in one operational platform.'
);

export const noIndexFollow: Metadata = {
  robots: { index: false, follow: true },
};
