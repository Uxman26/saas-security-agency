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
  BarChart3,
  Lock,
  Zap,
  Globe,
  Heart,
  Target,
  Layers,
  ArrowRight,
  CheckCircle2,
  Building2,
  Clock,
  Sparkles,
} from 'lucide-react';

const values = [
  { icon: ShieldCheck, title: 'Compliance first', desc: 'SIA tracking, document expiry alerts and audit-ready records built into every workflow.' },
  { icon: Zap, title: 'Speed to value', desc: 'Subscribe, create your company and go live in minutes—not months of IT projects.' },
  { icon: Heart, title: 'Operator-focused', desc: 'Designed with security company owners who run rotas, payroll and client billing daily.' },
  { icon: Lock, title: 'Secure by design', desc: 'Role-based access, company isolation and authenticated sessions across the platform.' },
];

const modules = [
  { icon: Users, title: 'Staff & compliance', items: ['Guard profiles & SIA licences', 'Document vault with expiry alerts', 'Right-to-work & DBS tracking'] },
  { icon: MapPin, title: 'Sites & clients', items: ['Client contracts & renewals', 'Site rates & contact management', 'Contractor directory'] },
  { icon: Calendar, title: 'Scheduling', items: ['Rota planner & shift grid', 'Assignments by site & guard', 'Attendance & late tracking'] },
  { icon: Wallet, title: 'Payroll & billing', items: ['Payroll from worked shifts', 'Client invoicing & PDF export', 'Payments & allowances'] },
  { icon: BarChart3, title: 'Intelligence', items: ['Operations dashboard', 'Revenue & payroll charts', 'Contract & compliance alerts'] },
  { icon: Layers, title: 'Administration', items: ['Custom roles & permissions', 'Multi-user company accounts', 'Subscription & receipt management'] },
];

const timeline = [
  { year: '2024', title: 'Concept', desc: 'Paramount Tech identified fragmented tools across UK security firms—spreadsheets for rotas, separate payroll, manual SIA checks.' },
  { year: '2025', title: 'Platform launch', desc: 'SecureForce Manager shipped as a unified SaaS: guards, sites, rotas, payroll, invoices and compliance in one product.' },
  { year: 'Today', title: 'Growing with operators', desc: 'Serving security companies from small teams to larger multi-site operations with tiered plans and platform admin oversight.' },
];

const stats = [
  { value: '9+', label: 'Core modules' },
  { value: '30s', label: 'Company setup' },
  { value: '100%', label: 'Cloud-based' },
  { value: 'UK', label: 'Built for SIA ops' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="about" />

      <header className="relative overflow-hidden border-b border-border/50 min-h-[85vh] flex items-center">
        <ParticlesBackground className="absolute inset-0 -z-0" id="about-particles" />
        <div className="container relative z-10 mx-auto px-4 py-24 md:py-32">
          <div className="mx-auto max-w-4xl text-center">
            <ScrollReveal>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-4 py-1.5 text-sm text-primary backdrop-blur-sm">
                <Sparkles className="size-4" />
                About SecureForce Manager
              </div>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
                The operating system for{' '}
                <span className="bg-gradient-to-r from-primary via-blue-500 to-violet-500 bg-clip-text text-transparent">
                  security companies
                </span>
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <p className="mt-6 text-lg text-muted-foreground md:text-xl max-w-2xl mx-auto leading-relaxed">
                We built Security Agency SAAS so UK security firms can run staffing, scheduling, payroll and client billing from one intelligent platform—without spreadsheet chaos.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Button asChild size="lg" className="gap-2 shadow-lg shadow-primary/20">
                  <Link href="/pricing">Explore plans <ArrowRight className="size-4" /></Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="backdrop-blur-sm bg-background/50">
                  <Link href="/pricing">Start free setup</Link>
                </Button>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={400}>
              <div className="mt-16 grid grid-cols-2 gap-6 sm:grid-cols-4">
                {stats.map(({ value, label }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-md p-4 transition-transform hover:scale-105 hover:border-primary/30"
                  >
                    <p className="text-2xl font-bold text-primary md:text-3xl">{value}</p>
                    <p className="mt-1 text-xs text-muted-foreground md:text-sm">{label}</p>
                  </div>
                ))}
              </div>
            </ScrollReveal>
          </div>
        </div>
      </header>

      <section className="border-b border-border/50 py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            <ScrollReveal>
              <div className="relative">
                <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/20 via-transparent to-violet-500/10 blur-2xl" />
                <Card className="relative border-primary/20 bg-card/80 backdrop-blur-sm overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="rounded-xl bg-primary/10 p-3">
                        <Building2 className="size-6 text-primary" />
                      </div>
                      <CardTitle className="text-2xl">Who we are</CardTitle>
                    </div>
                    <CardDescription className="text-base leading-relaxed">
                      Paramount Tech develops enterprise-grade software for regulated industries. SecureForce Manager is our dedicated product for private security agencies operating across the United Kingdom.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-muted-foreground">
                    <p>
                      Our team combines product engineering with deep understanding of how security companies actually work—shift planning, contractor relationships, SIA compliance and tight margins on every contract.
                    </p>
                    <p>
                      We believe operators deserve software that matches the complexity of their business without requiring an IT department to maintain it.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <Target className="size-8 text-primary" />
                  <h2 className="text-3xl font-bold text-foreground">Our mission</h2>
                </div>
                <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                  Give every security company—from a ten-guard startup to a multi-contract operation—the same operational clarity that large firms get from expensive bespoke systems.
                </p>
                <ul className="space-y-4">
                  {[
                    'Replace disconnected spreadsheets with one live source of truth',
                    'Keep guards compliant before auditors or clients ask',
                    'Turn worked shifts into payroll and invoices automatically',
                    'Scale teams and sites without scaling admin headcount',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 group">
                      <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5 transition-transform group-hover:scale-110" />
                      <span className="text-foreground/90">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 md:py-28 bg-muted/25">
        <div className="container mx-auto px-4">
          <ScrollReveal className="mx-auto max-w-2xl text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
              What the product does
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Six integrated pillars that cover the full security company lifecycle.
            </p>
          </ScrollReveal>
          <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map(({ icon: Icon, title, items }, i) => (
              <ScrollReveal key={title} delay={i * 80}>
                <Card className="h-full border-border/70 bg-card/90 transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1">
                  <CardHeader>
                    <div className="rounded-xl bg-gradient-to-br from-primary/15 to-violet-500/10 p-3 w-fit mb-2">
                      <Icon className="size-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {items.map((item) => (
                        <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="size-1.5 rounded-full bg-primary shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 md:py-28">
        <div className="container mx-auto px-4">
          <ScrollReveal className="mx-auto max-w-2xl text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Our values</h2>
            <p className="mt-4 text-muted-foreground text-lg">Principles behind every feature we ship.</p>
          </ScrollReveal>
          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2">
            {values.map(({ icon: Icon, title, desc }, i) => (
              <ScrollReveal key={title} delay={i * 100}>
                <div className="group flex gap-4 rounded-2xl border border-border/60 bg-card/50 p-6 transition-all hover:border-primary/25 hover:bg-card">
                  <div className="rounded-xl bg-primary/10 p-3 h-fit transition-transform group-hover:scale-110 group-hover:bg-primary/15">
                    <Icon className="size-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 md:py-28 bg-muted/25">
        <div className="container mx-auto px-4">
          <ScrollReveal className="mx-auto max-w-2xl text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Our journey</h2>
          </ScrollReveal>
          <div className="mx-auto max-w-3xl">
            {timeline.map(({ year, title, desc }, i) => (
              <ScrollReveal key={year} delay={i * 120}>
                <div className="relative flex gap-6 pb-12 last:pb-0">
                  {i < timeline.length - 1 && (
                    <div className="absolute left-[27px] top-14 bottom-0 w-px bg-gradient-to-b from-primary/40 to-transparent" />
                  )}
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary/10 font-bold text-primary text-sm">
                    {year}
                  </div>
                  <div className="pt-2">
                    <h3 className="text-xl font-semibold text-foreground">{title}</h3>
                    <p className="mt-2 text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 md:py-28">
        <div className="container mx-auto px-4">
          <ScrollReveal>
            <Card className="mx-auto max-w-4xl overflow-hidden border-primary/20">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5 pointer-events-none" />
              <CardContent className="relative p-8 md:p-12">
                <div className="grid gap-8 md:grid-cols-3">
                  <div className="text-center md:text-left">
                    <Globe className="size-8 text-primary mx-auto md:mx-0 mb-3" />
                    <h3 className="font-semibold text-foreground">Cloud-native</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Access from any device. No servers to maintain.</p>
                  </div>
                  <div className="text-center md:text-left">
                    <Clock className="size-8 text-primary mx-auto md:mx-0 mb-3" />
                    <h3 className="font-semibold text-foreground">Always current</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Continuous updates with new modules and improvements.</p>
                  </div>
                  <div className="text-center md:text-left">
                    <Shield className="size-8 text-primary mx-auto md:mx-0 mb-3" />
                    <h3 className="font-semibold text-foreground">Tenant isolation</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Your company data is scoped and permission-controlled.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <ScrollReveal className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Ready to modernise your agency?
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto text-lg">
            Join security operators who run guards, rotas, payroll and invoices on one platform.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="gap-2">
              <Link href="/pricing">Create your company <ArrowRight className="size-4" /></Link>
            </Button>
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
