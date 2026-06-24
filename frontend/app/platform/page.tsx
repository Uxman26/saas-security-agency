import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { platformMetadata } from '@/lib/marketing-seo';

export const metadata = platformMetadata;

const SECTIONS = [
  { id: 'workforce', title: 'Workforce management', text: 'Keep employee, contractor and subcontractor details, contacts, working records and important documents organised in one profile.' },
  { id: 'sites', title: 'Sites and locations', text: 'Manage business locations, client sites, contacts and default commercial rates without duplicating information.' },
  { id: 'rota', title: 'Rotas and shifts', text: 'Build rotas, assign available team members and organise day, night, weekend and holiday work.' },
  { id: 'records', title: 'Workforce documents', text: 'Record licences, right-to-work information and document expiry dates, with reminders before action is required.' },
  { id: 'rates', title: 'Rates and allowances', text: 'Apply employee pay rates, client charge rates and allowances to the work they relate to.' },
  { id: 'payroll', title: 'Payroll preparation', text: 'Prepare pay information from scheduled or completed assignments, including supported rates and allowances.' },
  { id: 'invoicing', title: 'Client invoicing', text: 'Prepare client invoices using assignment information, charge rates and approved adjustments.' },
  { id: 'reporting', title: 'Operational dashboards', text: 'Review upcoming shifts, workforce status, document warnings and financial information from one dashboard.' },
];

export default function PlatformPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="platform" />
      <section className="border-b border-border/50 py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <Eyebrow>ControlOps platform</Eyebrow>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">One platform for the work behind every shift</h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Bring your workforce, rotas, locations, records, rates, payroll information and client billing together so operations, payroll and finance work from the same current information.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <MarketingCta href="/book-demo">Book a demo</MarketingCta>
            <MarketingCta href="/pricing" variant="outline">View pricing</MarketingCta>
          </div>
        </div>
      </section>
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-4xl space-y-16">
          {SECTIONS.map((s) => (
            <div key={s.id} id={s.id} className="scroll-mt-20 border-b border-border/50 pb-12 last:border-0">
              <h2 className="text-2xl font-bold">{s.title}</h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="py-16 bg-muted/20 border-t">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-2xl font-bold">See ControlOps for your operation</h2>
          <p className="mt-4 text-muted-foreground">Book a tailored demonstration using your workforce, locations and billing requirements.</p>
          <div className="mt-8">
            <MarketingCta href="/book-demo">Book a demo</MarketingCta>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
