import Link from 'next/link';
import { MarketingBrand } from '@/components/marketing/marketing-brand';

const product = [
  { href: '/platform', label: 'Platform' },
  { href: '/platform#workforce', label: 'Workforce management' },
  { href: '/platform#rota', label: 'Rota and scheduling' },
  { href: '/platform#sites', label: 'Sites and locations' },
  { href: '/platform#records', label: 'Workforce records' },
  { href: '/platform#payroll', label: 'Payroll' },
  { href: '/platform#invoicing', label: 'Invoicing' },
  { href: '/platform#reporting', label: 'Reporting' },
  { href: '/pricing', label: 'Pricing' },
];

const industries = [
  { href: '/industries/security', label: 'Security' },
  { href: '/industries/cleaning-facilities', label: 'Cleaning & Facilities' },
  { href: '/industries/event-staffing', label: 'Event Staffing' },
  { href: '/industries/temporary-staffing', label: 'Temporary Staffing' },
  { href: '/industries', label: 'Other Multi-site Service Businesses' },
];

const company = [
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/book-demo', label: 'Book a demo' },
  { href: '/login', label: 'Sign in' },
];

const legal = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/cookies', label: 'Cookie Policy' },
  { href: '/dpa', label: 'Data Processing Agreement' },
  { href: '/accessibility', label: 'Accessibility Statement' },
  { href: '/security', label: 'Security' },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/50 py-12 bg-muted/20">
      <div className="container mx-auto px-4">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <MarketingBrand linked={false} />
            <p className="mt-3 text-sm text-muted-foreground max-w-md">
              ControlOps is workforce operations software for shift-based service businesses that manage employees, contractors, sites and client assignments.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Every shift. One operational system.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold mb-3">Product</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {product.map((l) => (
                <li key={l.href}><Link href={l.href} className="hover:text-foreground">{l.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold mb-3">Industries</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {industries.map((l) => (
                <li key={l.href}><Link href={l.href} className="hover:text-foreground">{l.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold mb-3">Company</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6">
              {company.map((l) => (
                <li key={l.href}><Link href={l.href} className="hover:text-foreground">{l.label}</Link></li>
              ))}
            </ul>
            <p className="text-sm font-semibold mb-3">Legal</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {legal.map((l) => (
                <li key={l.href}><Link href={l.href} className="hover:text-foreground">{l.label}</Link></li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-10 text-xs text-muted-foreground border-t pt-6">
          © {new Date().getFullYear()} ControlOps. Workforce operations software for shift-based service businesses.
        </p>
      </div>
    </footer>
  );
}
