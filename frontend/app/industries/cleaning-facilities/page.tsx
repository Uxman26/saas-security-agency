import { IndustryPageTemplate } from '@/components/marketing/industry-page-template';
import { cleaningIndustryMetadata } from '@/lib/marketing-seo';

export const metadata = cleaningIndustryMetadata;

export default function CleaningIndustryPage() {
  return (
    <IndustryPageTemplate
      eyebrow="Workforce operations software for cleaning and facilities contractors"
      title="Manage mobile teams, client sites, rotas, pay information and billing in one place."
      paragraph="ControlOps helps cleaning and facilities businesses schedule employees and contractors across customer locations, maintain workforce records, apply rates, prepare payroll information and organise client billing."
      cta="Book a cleaning and facilities demo"
      problems={[
        { title: 'Multi-site scheduling', text: 'Teams move across customer locations with changing shift patterns that are hard to coordinate centrally.' },
        { title: 'Rate complexity', text: 'Different pay rates and client charge rates apply across sites and contract types.' },
        { title: 'Admin duplication', text: 'Workforce records, payroll information and client billing often rely on separate spreadsheets.' },
      ]}
      capabilities={[
        { title: 'Workforce records', text: 'Keep employee and contractor details and documents organised.' },
        { title: 'Client sites', text: 'Manage locations, contacts and default rates per site.' },
        { title: 'Rota planning', text: 'Schedule recurring and variable shifts across teams.' },
        { title: 'Rates and allowances', text: 'Apply pay and charge rates to the work they relate to.' },
        { title: 'Payroll preparation', text: 'Prepare pay information from completed assignments.' },
        { title: 'Client billing', text: 'Connect delivered work to client invoices.' },
      ]}
      workflow={[
        'Set up company, users and operational settings.',
        'Add workforce records and customer sites.',
        'Schedule shifts, maintain records and prepare payroll and billing.',
      ]}
      faqs={[
        { q: 'Is ControlOps only for cleaning companies?', a: 'No. ControlOps supports multiple shift-based service industries including facilities management.' },
        { q: 'Can we manage contractors as well as employees?', a: 'Yes. Workforce records can include employees and contractors where supported by your plan.' },
        { q: 'Can we book a demo for our specific contracts?', a: 'Yes. We will tailor the demonstration to your sites, rotas and billing process.' },
      ]}
    />
  );
}
