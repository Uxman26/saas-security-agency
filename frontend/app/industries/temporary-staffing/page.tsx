import { IndustryPageTemplate } from '@/components/marketing/industry-page-template';
import { staffingIndustryMetadata } from '@/lib/marketing-seo';

export const metadata = staffingIndustryMetadata;

export default function TemporaryStaffingPage() {
  return (
    <IndustryPageTemplate
      eyebrow="Workforce operations software for temporary staffing agencies"
      title="Manage workers, client assignments, pay rates, charge rates and invoices in one system."
      paragraph="ControlOps helps temporary staffing agencies organise workers, locations, availability and assignments while keeping payroll preparation and client billing connected to the work delivered."
      cta="Book a staffing agency demo"
      problems={[
        { title: 'Worker availability', text: 'Matching workers to client assignments across locations requires organised records.' },
        { title: 'Dual rates', text: 'Pay rates and client charge rates must stay aligned to each assignment.' },
        { title: 'Billing lag', text: 'Payroll preparation and client invoicing often trail behind completed work.' },
      ]}
      capabilities={[
        { title: 'Worker management', text: 'Maintain worker profiles, contacts and records.' },
        { title: 'Client assignments', text: 'Organise work across client locations.' },
        { title: 'Rota and scheduling', text: 'Plan shifts and assignments across your workforce.' },
        { title: 'Pay and charge rates', text: 'Apply rates to the assignments they relate to.' },
        { title: 'Payroll preparation', text: 'Prepare pay information from completed work.' },
        { title: 'Client invoicing', text: 'Prepare invoices from assignment and rate data.' },
      ]}
      workflow={[
        'Set up agency settings, rates and permissions.',
        'Add workers and client assignment locations.',
        'Schedule work and prepare payroll and client billing.',
      ]}
      faqs={[
        { q: 'Can we manage pay and charge rates separately?', a: 'Yes. Employee pay rates and client charge rates can be applied to relevant work.' },
        { q: 'Does ControlOps replace agency compliance duties?', a: 'No. ControlOps helps manage operational records. Your agency remains responsible for compliance.' },
        { q: 'Can we see a demo for our agency model?', a: 'Yes. Book a demonstration tailored to your assignments and billing process.' },
      ]}
    />
  );
}
