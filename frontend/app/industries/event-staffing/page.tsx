import { IndustryPageTemplate } from '@/components/marketing/industry-page-template';
import { eventIndustryMetadata } from '@/lib/marketing-seo';

export const metadata = eventIndustryMetadata;

export default function EventStaffingPage() {
  return (
    <IndustryPageTemplate
      eyebrow="Workforce operations software for event staffing businesses"
      title="Coordinate temporary workers, venues, assignments, rates and client charges."
      paragraph="ControlOps helps event staffing companies organise workers, schedule venue assignments, maintain documents, apply variable rates and connect delivered work to payroll preparation and client billing."
      cta="Book an event staffing demo"
      problems={[
        { title: 'Variable event schedules', text: 'Short-notice assignments and changing venues make rota planning demanding.' },
        { title: 'Temporary workforce', text: 'Workers, documents and availability must be organised quickly for each event.' },
        { title: 'Client charges', text: 'Variable rates and assignments need to connect to payroll and client billing.' },
      ]}
      capabilities={[
        { title: 'Worker records', text: 'Maintain profiles, contacts and document records.' },
        { title: 'Venue assignments', text: 'Schedule work across locations and events.' },
        { title: 'Variable rates', text: 'Apply pay and charge rates to assignments.' },
        { title: 'Document tracking', text: 'Record licences and expiry dates with reminders.' },
        { title: 'Payroll preparation', text: 'Prepare pay from completed event work.' },
        { title: 'Client billing', text: 'Prepare client charges from assignment data.' },
      ]}
      workflow={[
        'Configure rates, document types and users.',
        'Add workers and venue locations.',
        'Schedule event assignments and prepare payroll and billing.',
      ]}
      faqs={[
        { q: 'Can ControlOps handle short-notice events?', a: 'ControlOps supports rota planning and assignments. Book a demo to confirm it fits your event workflow.' },
        { q: 'Can we manage multiple venues?', a: 'Yes. Sites and locations can be managed across your operation.' },
        { q: 'Is there specialist event software?', a: 'ControlOps is workforce operations software suited to event staffing alongside other shift-based businesses.' },
      ]}
    />
  );
}
