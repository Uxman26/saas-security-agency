'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { ParticlesBackground } from '@/components/marketing/particles-background';
import { ScrollReveal } from '@/components/marketing/scroll-reveal';
import {
  Shield,
  ShieldCheck,
  Users,
  MapPin,
  Calendar,
  FileText,
  Wallet,
  ClipboardList,
  BarChart3,
  UserCog,
  AlertTriangle,
  ArrowRight,
  Check,
  Lock,
  Zap,
  Quote,
  Sparkles,
} from 'lucide-react';

const features = [
  { title: 'Guard management', description: 'Track guards, SIA licences, documents and compliance with expiry alerts.', icon: Users },
  { title: 'Sites & clients', description: 'Manage sites, clients and contact details with default rates per site.', icon: MapPin },
  { title: 'Assignments & rota', description: 'Schedule shifts, day/night/holiday rates and view rota by date range.', icon: Calendar },
  { title: 'Payroll', description: 'Calculate pay from assignments, bank/cash split, allowances and payslips.', icon: Wallet },
  { title: 'Invoicing', description: 'Generate client invoices from assignments with PDF export.', icon: FileText },
  { title: 'Compliance', description: 'Expiring document alerts so you stay on top of SIA and right-to-work.', icon: AlertTriangle },
  { title: 'Sub-contractors', description: 'Manage sub-contractor details and licence numbers.', icon: UserCog },
  { title: 'Allowances & rates', description: 'Guard and site rates, allowances in payroll and invoices.', icon: ClipboardList },
  { title: 'Dashboard', description: 'Active guards, revenue, late arrivals, upcoming shifts at a glance.', icon: BarChart3 },
];

const stats = [
  { value: 'One platform', label: 'Guards, sites, payroll & billing' },
  { value: 'SIA-ready', label: 'Licence & document tracking' },
  { value: 'Compliant', label: 'Expiry alerts & right-to-work' },
  { value: 'Scalable', label: 'From small teams to large ops' },
];

const steps = [
  { step: '01', title: 'Choose your plan', desc: 'Pick Basic, Standard or Premium. No long-term lock-in.' },
  { step: '02', title: 'Create your company', desc: 'Sign up with your details and company name in under a minute.' },
  { step: '03', title: 'Go live', desc: 'Add guards, sites and start scheduling. Payroll and invoices ready when you are.' },
];

const faqs = [
  { q: 'Can I change my plan later?', a: 'Yes. You can upgrade or downgrade your subscription from your account.' },
  { q: 'Is my data secure?', a: 'We treat security as a priority. Access is authenticated and data is stored securely.' },
  { q: 'Do you support SIA compliance?', a: 'Yes. Track SIA numbers, expiry dates and get alerts before documents expire.' },
  { q: 'Can I try before I subscribe?', a: 'Create a company on any plan and start using the platform. Contact us for tailored trials.' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="home" />

      <header className="relative overflow-hidden border-b border-border/50 min-h-[90vh] flex items-center">
        <ParticlesBackground className="absolute inset-0 -z-0" id="home-particles" />
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15 animate-radar-ring pointer-events-none" />
        <div
          className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15 animate-radar-ring pointer-events-none"
          style={{ animationDelay: '1s' }}
        />
        <div className="container relative z-10 mx-auto px-4 py-24 md:py-32">
          <div className="mx-auto max-w-4xl text-center">
            <ScrollReveal>
              <div className="mb-8 flex justify-center">
                <div className="rounded-2xl border border-primary/25 bg-card/70 p-6 shadow-xl backdrop-blur-md transition-transform hover:scale-105">
                  <Shield className="size-16 text-primary animate-shield-pulse" />
                </div>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={80}>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-4 py-1.5 text-sm text-primary backdrop-blur-sm">
                <Lock className="size-4" />
                Security company management
              </div>
            </ScrollReveal>
            <ScrollReveal delay={160}>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
                Run your security agency in{' '}
                <span className="bg-gradient-to-r from-primary via-blue-500 to-violet-500 bg-clip-text text-transparent">
                  one place
                </span>
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={240}>
              <p className="mt-6 text-lg text-muted-foreground md:text-xl max-w-2xl mx-auto leading-relaxed">
                Guards, sites, rotas, payroll and invoicing. Subscribe to a plan, create your company, and operate with full control and compliance.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={320}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Button asChild size="lg" className="gap-2 shadow-lg shadow-primary/20">
                  <Link href="/pricing">View plans <ArrowRight className="size-4" /></Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="backdrop-blur-sm bg-background/50">
                  <Link href="/signup">Create company</Link>
                </Button>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </header>

      <section className="border-b border-border/50 py-14 md:py-20 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {stats.map(({ value, label }, i) => (
              <ScrollReveal key={value} delay={i * 80}>
                <div className="text-center rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-5 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5">
                  <p className="text-xl font-bold text-primary md:text-2xl">{value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{label}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 md:py-28">
        <div className="container mx-auto px-4">
          <ScrollReveal className="mx-auto max-w-2xl text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
              Everything you need to operate
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              One platform for staffing, scheduling, pay and billing. Built for security companies.
            </p>
          </ScrollReveal>
          <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ title, description, icon: Icon }, i) => (
              <ScrollReveal key={title} delay={i * 60}>
                <Card className="h-full border-border/70 bg-card/90 transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1">
                  <CardHeader className="pb-2">
                    <div className="rounded-xl bg-gradient-to-br from-primary/15 to-violet-500/10 p-3 w-fit text-primary mb-2 transition-transform group-hover:scale-110">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-lg">{title}</CardTitle>
                    <CardDescription className="text-base">{description}</CardDescription>
                  </CardHeader>
                </Card>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 md:py-28 bg-muted/25">
        <div className="container mx-auto px-4">
          <ScrollReveal className="mx-auto max-w-2xl text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
              How it works
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Get from signup to live operations in three steps.
            </p>
          </ScrollReveal>
          <div className="mx-auto grid max-w-4xl gap-10 md:grid-cols-3">
            {steps.map(({ step, title, desc }, i) => (
              <ScrollReveal key={step} delay={i * 120}>
                <div className="relative text-center group">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-lg font-bold text-primary transition-transform group-hover:scale-110 group-hover:bg-primary/20">
                    {step}
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-muted-foreground">{desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 md:py-28">
        <div className="container mx-auto px-4">
          <ScrollReveal>
            <Card className="mx-auto max-w-3xl border-primary/20 bg-gradient-to-br from-primary/5 via-card/80 to-violet-500/5 backdrop-blur-sm overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <CardContent className="relative p-8 md:p-12">
                <Quote className="size-10 text-primary/40 mb-4" />
                <p className="text-lg md:text-xl text-foreground/90 italic leading-relaxed">
                  We moved from spreadsheets to this platform and cut admin time by half. Rota, payroll and invoices in one place—exactly what a security company needs.
                </p>
                <p className="mt-4 font-medium text-foreground">Operations Director, UK security firm</p>
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 md:py-28 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl">
            <div className="grid gap-8 md:grid-cols-2 md:gap-12">
              <ScrollReveal>
                <div className="group rounded-2xl border border-border/60 bg-card/50 p-6 transition-all hover:border-primary/25 hover:shadow-lg">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="rounded-lg bg-primary/10 p-2.5 text-primary transition-transform group-hover:scale-110">
                      <ShieldCheck className="size-6" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground">Built for compliance</h3>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    SIA licence tracking, document expiry alerts and right-to-work status in one place. Stay audit-ready without the spreadsheet chaos.
                  </p>
                </div>
              </ScrollReveal>
              <ScrollReveal delay={120}>
                <div className="group rounded-2xl border border-border/60 bg-card/50 p-6 transition-all hover:border-primary/25 hover:shadow-lg">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="rounded-lg bg-primary/10 p-2.5 text-primary transition-transform group-hover:scale-110">
                      <Zap className="size-6" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground">Fast to deploy</h3>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    Sign up, create your company and add your first guards and sites in minutes. No lengthy onboarding or IT setup.
                  </p>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 md:py-28">
        <div className="container mx-auto px-4">
          <ScrollReveal>
            <Card className="mx-auto max-w-4xl border-primary/20 bg-primary/5 backdrop-blur-sm">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs text-primary">
                  <Sparkles className="size-3.5" />
                  Simple pricing
                </div>
                <CardTitle className="text-2xl md:text-3xl">Choose a plan and create your company</CardTitle>
                <CardDescription className="text-base md:text-lg mt-2">
                  Three tiers to match your size. Sign up once and start managing guards, sites and payroll.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-8 pt-6">
                <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
                  {['Guard & site management', 'Rota & assignments', 'Payroll & invoices', 'Compliance alerts'].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check className="size-4 text-primary shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <Button asChild size="lg" className="shadow-md shadow-primary/15">
                    <Link href="/pricing">See plans</Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link href="/signup">Sign up</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 md:py-28 bg-muted/25">
        <div className="container mx-auto px-4">
          <ScrollReveal className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Frequently asked questions
            </h2>
          </ScrollReveal>
          <div className="mx-auto max-w-2xl space-y-4">
            {faqs.map(({ q, a }, i) => (
              <ScrollReveal key={q} delay={i * 80}>
                <div className="rounded-xl border border-border/70 bg-card/80 backdrop-blur-sm p-6 transition-all hover:border-primary/20 hover:shadow-md">
                  <h4 className="font-semibold text-foreground">{q}</h4>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{a}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <ScrollReveal className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Ready to run your agency in one place?
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto text-lg">
            Join security companies who use one platform for guards, rotas, payroll and invoices.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="gap-2 shadow-lg shadow-primary/20">
              <Link href="/signup">Create company <ArrowRight className="size-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/about">Learn about us</Link>
            </Button>
          </div>
        </ScrollReveal>
      </section>

      <MarketingFooter />
    </div>
  );
}
