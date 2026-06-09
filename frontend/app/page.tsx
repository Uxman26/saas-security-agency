import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
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
      <nav className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
            <Shield className="size-5 text-primary" />
            Security Agency
          </Link>
          <div className="hidden sm:flex items-center gap-6 text-sm mr-2">
            <Link href="/about" className="text-muted-foreground hover:text-foreground transition-colors">About</Link>
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <header className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-15%,var(--primary)/12%,transparent)] animate-glow-breathe" />
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20 animate-radar-ring" />
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20 animate-radar-ring" style={{ animationDelay: '0.8s' }} />
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20 animate-radar-ring" style={{ animationDelay: '1.6s' }} />
        <div className="absolute left-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-primary/30 to-transparent animate-scan-line" />
        <div className="container relative mx-auto px-4 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-8 flex justify-center">
              <div className="rounded-2xl border border-primary/20 bg-card/80 p-6 shadow-xl backdrop-blur-sm">
                <Shield className="size-16 text-primary animate-shield-pulse" />
              </div>
            </div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary">
              <Lock className="size-4" />
              Security company management
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
              Run your security agency in one place
            </h1>
            <p className="mt-6 text-lg text-muted-foreground md:text-xl max-w-2xl mx-auto">
              Guards, sites, rotas, payroll and invoicing. Subscribe to a plan, create your company, and operate with full control and compliance.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Button asChild size="lg" className="gap-2">
                <Link href="/pricing">View plans <ArrowRight className="size-4" /></Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/signup">Create company</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <section className="border-b border-border/50 py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map(({ value, label }, i) => (
              <div key={value} className="text-center">
                <p className="text-2xl font-bold text-foreground md:text-3xl">{value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-16 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
              Everything you need to operate
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              One platform for staffing, scheduling, pay and billing. Built for security companies.
            </p>
          </div>
          <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ title, description, icon: Icon }, i) => (
              <Card
                key={title}
                className="opacity-0 border-border/80 transition-all duration-300 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5 animate-fade-in-up"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <CardHeader className="pb-2">
                  <div className="rounded-xl bg-primary/10 p-3 w-fit text-primary transition-colors hover:bg-primary/20">
                    <Icon className="size-5" />
                  </div>
                  <CardTitle className="text-lg">{title}</CardTitle>
                  <CardDescription className="text-base">{description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-16 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
              How it works
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Get from signup to live operations in three steps.
            </p>
          </div>
          <div className="mx-auto grid max-w-4xl gap-10 md:grid-cols-3">
            {steps.map(({ step, title, desc }) => (
              <div key={step} className="relative text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-lg font-bold text-primary">
                  {step}
                </div>
                <h3 className="text-xl font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-16 md:py-28">
        <div className="container mx-auto px-4">
          <Card className="mx-auto max-w-3xl border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="p-8 md:p-12">
              <Quote className="size-10 text-primary/40 mb-4" />
              <p className="text-lg md:text-xl text-foreground/90 italic">
                We moved from spreadsheets to this platform and cut admin time by half. Rota, payroll and invoices in one place—exactly what a security company needs.
              </p>
              <p className="mt-4 font-medium text-foreground">Operations Director, UK security firm</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-b border-border/50 py-16 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl">
            <div className="grid gap-8 md:grid-cols-2 md:gap-12">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                    <ShieldCheck className="size-6" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">Built for compliance</h3>
                </div>
                <p className="text-muted-foreground">
                  SIA licence tracking, document expiry alerts and right-to-work status in one place. Stay audit-ready without the spreadsheet chaos.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                    <Zap className="size-6" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">Fast to deploy</h3>
                </div>
                <p className="text-muted-foreground">
                  Sign up, create your company and add your first guards and sites in minutes. No lengthy onboarding or IT setup.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-16 md:py-28">
        <div className="container mx-auto px-4">
          <Card className="mx-auto max-w-4xl border-primary/20 bg-primary/5">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl md:text-3xl">Choose a plan and create your company</CardTitle>
              <CardDescription className="text-base md:text-lg mt-2">
                Three tiers to match your size. Sign up once and start managing guards, sites and payroll.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-8 pt-6">
              <ul className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><Check className="size-4 text-primary" /> Guard & site management</li>
                <li className="flex items-center gap-2"><Check className="size-4 text-primary" /> Rota & assignments</li>
                <li className="flex items-center gap-2"><Check className="size-4 text-primary" /> Payroll & invoices</li>
                <li className="flex items-center gap-2"><Check className="size-4 text-primary" /> Compliance alerts</li>
              </ul>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Button asChild size="lg"><Link href="/pricing">See plans</Link></Button>
                <Button asChild variant="outline" size="lg"><Link href="/signup">Sign up</Link></Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-b border-border/50 py-16 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Frequently asked questions
            </h2>
          </div>
          <div className="mx-auto max-w-2xl space-y-6">
            {faqs.map(({ q, a }) => (
              <div key={q} className="rounded-xl border border-border/80 bg-card p-6">
                <h4 className="font-semibold text-foreground">{q}</h4>
                <p className="mt-2 text-sm text-muted-foreground">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Ready to run your agency in one place?
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Join security companies who use one platform for guards, rotas, payroll and invoices.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="gap-2">
              <Link href="/signup">Create company <ArrowRight className="size-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">View pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Shield className="size-5 text-primary" />
              Security Agency SAAS
            </div>
            <div className="flex items-center gap-8 text-sm text-muted-foreground">
              <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
              <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
              <Link href="/signup" className="hover:text-foreground transition-colors">Sign up</Link>
              <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground md:text-left">
            Security company management platform. Guards, sites, rota, payroll and invoicing.
          </p>
        </div>
      </footer>
    </div>
  );
}
