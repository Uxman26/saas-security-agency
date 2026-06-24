'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { ScrollReveal } from '@/components/marketing/scroll-reveal';
import {
  Users,
  MapPin,
  Calendar,
  FileText,
  Wallet,
  ClipboardList,
  BarChart3,
  Check,
  ArrowRight,
} from 'lucide-react';

const HIGHLIGHTS = [
  { title: 'One operational view', text: 'People, locations, shifts and costs in one place.' },
  { title: 'Flexible shift planning', text: 'Organise rotas and assignments across teams and sites.' },
  { title: 'Workforce records', text: 'Keep documents, licences and expiry dates organised.' },
  { title: 'From shift to billing', text: 'Connect work records to payroll preparation and client invoices.' },
];

const CAPABILITIES = [
  { icon: Users, title: 'Workforce management', text: 'Keep employee, contractor and subcontractor details, contacts, working records and important documents organised in one profile.', href: '/platform#workforce' },
  { icon: MapPin, title: 'Sites and locations', text: 'Manage business locations, client sites, contacts and default commercial rates without duplicating information.', href: '/platform#sites' },
  { icon: Calendar, title: 'Rotas and shifts', text: 'Build rotas, assign available team members and organise day, night, weekend and holiday work.', href: '/platform#rota' },
  { icon: FileText, title: 'Workforce documents', text: 'Record licences, right-to-work information and document expiry dates, with reminders before action is required.', href: '/platform#records' },
  { icon: ClipboardList, title: 'Rates and allowances', text: 'Apply employee pay rates, client charge rates and allowances to the work they relate to.', href: '/platform#rates' },
  { icon: Wallet, title: 'Payroll preparation', text: 'Prepare pay information from scheduled or completed assignments, including supported rates and allowances.', href: '/platform#payroll' },
  { icon: Wallet, title: 'Client invoicing', text: 'Prepare client invoices using assignment information, charge rates and approved adjustments.', href: '/platform#invoicing' },
  { icon: BarChart3, title: 'Operational dashboards', text: 'Review upcoming shifts, workforce status, document warnings and financial information from one dashboard.', href: '/platform#reporting' },
];

const INDUSTRIES = [
  { title: 'Security services', text: 'Manage guards, subcontractors, client sites, rotas, SIA records, pay rates and client invoices.', href: '/industries/security', cta: 'ControlOps for security' },
  { title: 'Cleaning & facilities', text: 'Schedule mobile teams across customer locations while keeping records, rates, payroll information and client billing connected.', href: '/industries/cleaning-facilities', cta: 'ControlOps for cleaning & facilities' },
  { title: 'Event staffing', text: 'Coordinate temporary workers, venues, assignments, documents, rates and client charges for changing event schedules.', href: '/industries/event-staffing', cta: 'ControlOps for event staffing' },
  { title: 'Temporary staffing agencies', text: 'Manage workers, client assignments, availability, pay rates, charge rates, payroll preparation and invoices.', href: '/industries/temporary-staffing', cta: 'ControlOps for staffing agencies' },
  { title: 'Other multi-site service businesses', text: 'Organise employees, contractors, locations and shift-based work around the way your service operation runs.', href: '/industries', cta: 'Explore industries' },
];

const QUALIFICATION = [
  'Manages employees, contractors or subcontractors',
  'Schedules people across multiple locations or client sites',
  'Uses different pay rates and client charge rates',
  'Maintains licences, documents or workforce expiry dates',
  'Prepares payroll information from shifts or assignments',
  'Invoices clients for delivered work',
  'Currently relies on several spreadsheets or disconnected systems',
  'Needs operations, payroll and finance to work from the same information',
];

const STEPS = [
  { title: 'Configure your company', text: 'Add company information, users, permissions, document types, rates and operational settings.' },
  { title: 'Add your workforce and locations', text: 'Create employee or contractor records and add business locations or client sites.' },
  { title: 'Schedule and manage work', text: 'Build rotas, assign shifts, maintain workforce records and prepare payroll and billing information.' },
];

const FAQS = [
  { q: 'Is ControlOps only for security companies?', a: 'No. ControlOps is designed for shift-based service businesses that manage employees, contractors, locations or client assignments. It includes specialist workflows for security operations, but its core workforce, rota, payroll-preparation and billing features can support other service businesses.' },
  { q: 'What types of businesses can use ControlOps?', a: 'ControlOps is especially relevant to security, cleaning, facilities management, event staffing and temporary staffing businesses. Other sectors should book a demonstration so we can confirm the product fits their workflow.' },
  { q: 'Can we use ControlOps mainly for rota management?', a: 'Your available features depend on your plan. You can begin with the operational areas your team needs and introduce additional workflows as requirements develop.' },
  { q: 'Does ControlOps support security-company requirements?', a: 'Yes. Security operations can record guard and subcontractor details, SIA licence information, right-to-work records, document expiry dates, client sites, assignments, rates, payroll information and invoices. ControlOps supports internal processes but does not replace legal or regulatory responsibilities.' },
  { q: 'Can we move information from spreadsheets?', a: 'Import options depend on the format and the import features currently available. Contact us so we can review your workforce, location, rate and document data.' },
  { q: 'Can we see the platform before subscribing?', a: 'Yes. Book a demonstration to see the most relevant ControlOps workflows for your business.' },
];

export function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="home" />

      <section className="border-b border-border/50 overflow-hidden">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Eyebrow>Workforce operations software for shift-based service businesses</Eyebrow>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
                Manage your workforce, shifts, sites, payroll and client billing in one place.
              </h1>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
                ControlOps helps service businesses organise employees and contractors, schedule work across locations, manage workforce records, prepare payroll information and create client invoices — without disconnected spreadsheets.
              </p>
              <p className="mt-4 text-muted-foreground">
                Built for businesses that deliver work through <strong className="text-foreground font-semibold">people and shifts</strong>, with specialist workflows for <strong className="text-foreground font-semibold">security companies</strong>.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <MarketingCta href="/book-demo">Book a demo</MarketingCta>
                <Button asChild variant="outline" size="lg">
                  <Link href="/pricing">View pricing</Link>
                </Button>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                One operational platform for your workforce, sites, rotas, records, rates and billing.
              </p>
            </div>
            <div className="relative rounded-2xl border bg-card shadow-xl overflow-hidden">
              <div className="bg-muted/50 px-4 py-3 border-b flex items-center gap-2">
                <div className="size-3 rounded-full bg-red-400/80" />
                <div className="size-3 rounded-full bg-amber-400/80" />
                <div className="size-3 rounded-full bg-green-400/80" />
                <span className="ms-2 text-xs text-muted-foreground">ControlOps dashboard</span>
              </div>
              <div className="p-4 space-y-3 bg-gradient-to-br from-background to-muted/30">
                <div className="grid grid-cols-3 gap-2">
                  {['Upcoming shifts', 'Workforce', 'Document alerts'].map((l) => (
                    <div key={l} className="rounded-lg border bg-card p-3 text-xs">
                      <p className="text-muted-foreground">{l}</p>
                      <p className="mt-1 text-lg font-bold text-primary">—</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border bg-card p-4 h-32 flex items-center justify-center text-sm text-muted-foreground">
                  Shifts · Sites · Payroll · Billing
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-14 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="rounded-xl border bg-card p-5">
                <p className="font-semibold text-foreground">{h.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{h.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mb-12">
            <h2 className="text-3xl font-bold">One platform for the work behind every shift</h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Bring your workforce, rotas, locations, records, rates, payroll information and client billing together so operations, payroll and finance work from the same current information.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {CAPABILITIES.map(({ icon: Icon, title, text, href }) => (
              <Card key={title} className="h-full hover:border-primary/30 transition-colors">
                <CardHeader className="pb-2">
                  <div className="rounded-lg bg-primary/10 p-2 w-fit text-primary mb-2">
                    <Icon className="size-4" />
                  </div>
                  <CardTitle className="text-base">
                    <Link href={href} className="hover:text-primary">{title}</Link>
                  </CardTitle>
                  <CardDescription className="text-sm leading-relaxed">{text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mb-12">
            <h2 className="text-3xl font-bold">Built for businesses that deliver work through people and shifts</h2>
            <p className="mt-4 text-muted-foreground text-lg">
              ControlOps is especially suited to service businesses that deploy employees and contractors across client sites, manage changing rotas, maintain workforce records and connect completed work to payroll and billing.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {INDUSTRIES.map((ind) => (
              <Card key={ind.title} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg">{ind.title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">{ind.text}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-0">
                  <Button asChild variant="outline" size="sm">
                    <Link href={ind.href}>{ind.cta} <ArrowRight className="size-3.5 ms-1 rtl:rotate-180" /></Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-3xl font-bold">Is ControlOps right for your business?</h2>
          <p className="mt-4 text-muted-foreground text-lg">
            ControlOps is designed for growing service businesses that need more than a basic rota calendar.
          </p>
          <ul className="mt-8 space-y-3">
            {QUALIFICATION.map((item) => (
              <li key={item} className="flex items-start gap-3 text-muted-foreground">
                <Check className="size-5 text-primary shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <MarketingCta href="/book-demo">Discuss your requirements</MarketingCta>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold">Get your shift operations organised</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {STEPS.map((step, i) => (
              <div key={step.title} className="text-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border-2 border-primary bg-primary/10 font-bold text-primary">
                  {i + 1}
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <MarketingCta href="/book-demo">See how ControlOps works</MarketingCta>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-3xl font-bold">See ControlOps using your operational workflow</h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Book a tailored demonstration using examples that reflect your workforce, locations, rota process, rates and billing requirements.
          </p>
          <div className="mt-8">
            <MarketingCta href="/book-demo">Book a tailored demo</MarketingCta>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 bg-muted/20">
        <div className="container mx-auto px-4 max-w-4xl grid md:grid-cols-2 gap-8">
          <div className="rounded-2xl border bg-card p-6">
            <h3 className="text-xl font-semibold">Designed for shift-based complexity</h3>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Manage changing rotas, multiple locations, employee and contractor records, different rates and operational documents without maintaining separate spreadsheets for every process.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <h3 className="text-xl font-semibold">Specialist support for security operations</h3>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Security businesses can manage guard records, SIA licence information, right-to-work records, client sites, subcontractors, payroll information and client invoicing within the same platform.
            </p>
            <Link href="/industries/security" className="mt-4 inline-flex items-center text-sm font-medium text-primary hover:underline">
              Explore ControlOps for security <ArrowRight className="size-3.5 ms-1 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-3xl font-bold">Plans that grow with your operation</h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Choose a plan based on the size and requirements of your workforce. Upgrade or change your plan as your team and operational needs develop.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <MarketingCta href="/pricing">Compare plans</MarketingCta>
            <Button asChild variant="outline" size="lg">
              <Link href="/book-demo">Discuss your requirements</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 bg-muted/20">
        <div className="container mx-auto px-4 max-w-2xl">
          <h2 className="text-3xl font-bold text-center mb-10">Frequently asked questions</h2>
          <div className="space-y-4">
            {FAQS.map((f) => (
              <div key={f.q} className="rounded-xl border bg-card p-5">
                <h3 className="font-semibold">{f.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <ScrollReveal className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-3xl font-bold">Bring your shift operations into one place</h2>
          <p className="mt-4 text-muted-foreground text-lg">
            See how ControlOps can connect your workforce, locations, rotas, records, payroll preparation and client billing.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <MarketingCta href="/book-demo">Book a demo</MarketingCta>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">View pricing</Link>
            </Button>
          </div>
        </ScrollReveal>
      </section>

      <MarketingFooter />
    </div>
  );
}
