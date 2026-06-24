import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow } from '@/components/marketing/marketing-cta';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { industriesMetadata } from '@/lib/marketing-seo';

export const metadata = industriesMetadata;

const ITEMS = [
  { title: 'Security services', desc: 'Guards, subcontractors, client sites, SIA records, rotas, rates, payroll information and invoices.', href: '/industries/security' },
  { title: 'Cleaning & facilities', desc: 'Mobile teams, client locations, recurring shifts, worker records, pay information and billing.', href: '/industries/cleaning-facilities' },
  { title: 'Event staffing', desc: 'Temporary workers, venues, short-notice assignments, variable rates, documents and client charges.', href: '/industries/event-staffing' },
  { title: 'Temporary staffing', desc: 'Workers, client assignments, locations, availability, pay and charge rates, payroll preparation and invoices.', href: '/industries/temporary-staffing' },
];

export default function IndustriesPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="industries" />
      <section className="border-b border-border/50 py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <Eyebrow>Industries</Eyebrow>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">Shift-based service businesses</h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            ControlOps is especially suited to service businesses that deploy employees and contractors across client sites, manage changing rotas, maintain workforce records and connect completed work to payroll and billing.
          </p>
        </div>
      </section>
      <section className="py-16">
        <div className="container mx-auto px-4 grid md:grid-cols-2 gap-6 max-w-5xl">
          {ITEMS.map((item) => (
            <Card key={item.href}>
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">{item.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm">
                  <Link href={item.href}>Learn more <ArrowRight className="size-3.5 ms-1" /></Link>
                </Button>
              </CardContent>
            </Card>
          ))}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Other multi-site service businesses</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Organise employees, contractors, locations and shift-based work around the way your service operation runs. Book a demonstration to confirm ControlOps fits your workflow.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/book-demo">Book a demo</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
