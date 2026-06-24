import { IndustryPageTemplate } from '@/components/marketing/industry-page-template';
import { securityIndustryMetadata } from '@/lib/marketing-seo';

export const metadata = securityIndustryMetadata;

export default function SecurityIndustryPage() {
  return (
    <IndustryPageTemplate
      eyebrow="Workforce operations software for security companies"
      title="Manage guards, sites, rotas, workforce records, payroll and invoices in one place."
      paragraph="ControlOps helps security companies organise guards and subcontractors, manage client sites, build rotas, record SIA and right-to-work information, prepare payroll information and create client invoices."
      cta="Book a security operations demo"
      disclaimer="ControlOps helps security companies maintain operational and workforce records. It does not guarantee regulatory compliance or replace the checks, decisions and responsibilities required from your organisation."
      problems={[
        { title: 'Spreadsheet rotas', text: 'Shift planning, site coverage and subcontractor assignments spread across files that are hard to keep current.' },
        { title: 'Document tracking', text: 'SIA licences, right-to-work records and expiry dates need organised tracking before work is assigned.' },
        { title: 'Disconnected billing', text: 'Payroll preparation and client invoicing depend on the same assignment data but often live in separate processes.' },
      ]}
      capabilities={[
        { title: 'Guard and subcontractor records', text: 'Maintain profiles, contacts and working records in one place.' },
        { title: 'Client sites and rates', text: 'Manage locations, contacts and commercial rates without duplication.' },
        { title: 'Rota and assignments', text: 'Build rotas and assign guards across day, night, weekend and holiday work.' },
        { title: 'SIA and document records', text: 'Record licence and right-to-work information with expiry reminders.' },
        { title: 'Payroll preparation', text: 'Prepare pay information from scheduled or completed assignments.' },
        { title: 'Client invoicing', text: 'Prepare invoices using assignment information and charge rates.' },
      ]}
      workflow={[
        'Configure company settings, document types and rates.',
        'Add guards, subcontractors and client sites.',
        'Build rotas, maintain records and prepare payroll and billing information.',
      ]}
      faqs={[
        { q: 'Does ControlOps replace SIA compliance responsibilities?', a: 'No. ControlOps helps you maintain operational records. Your organisation remains responsible for compliance checks and decisions.' },
        { q: 'Can we manage subcontractors?', a: 'Yes. Subcontractor details and assignments can be managed alongside employee guards where your plan includes this.' },
        { q: 'Can we see the platform before subscribing?', a: 'Yes. Book a security operations demonstration tailored to your workflow.' },
      ]}
    />
  );
}
