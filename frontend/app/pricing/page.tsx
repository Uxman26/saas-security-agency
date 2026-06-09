'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Check } from 'lucide-react';

const tiers = [
  {
    id: 'basic',
    name: 'Basic',
    price: '£29',
    period: '/month',
    description: 'For small teams getting started.',
    features: ['Up to 10 guards', 'Sites & assignments', 'Rota view', 'Payroll & invoices', 'Compliance alerts'],
    cta: 'Get started',
    highlighted: false,
  },
  {
    id: 'standard',
    name: 'Standard',
    price: '£79',
    period: '/month',
    description: 'For growing security companies.',
    features: ['Up to 50 guards', 'Everything in Basic', 'Clients & sub-contractors', 'Allowances & rates', 'Dashboard stats'],
    cta: 'Get started',
    highlighted: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '£149',
    period: '/month',
    description: 'For larger operations.',
    features: ['Unlimited guards', 'Everything in Standard', 'Priority support', 'Custom reporting', 'API access'],
    cta: 'Get started',
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="pricing" />
      <div className="container mx-auto px-4 pt-16 pb-16 md:pt-24 md:pb-24">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary">
            Memberships
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Choose your plan
          </h1>
          <p className="mt-4 text-muted-foreground">
            Subscribe to a plan and create your company. You can change or cancel later.
          </p>
        </div>
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-3 lg:gap-6">
          {tiers.map((tier) => (
            <Card
              key={tier.id}
              className={`relative flex flex-col ${
                tier.highlighted
                  ? 'border-primary shadow-lg shadow-primary/10 dark:shadow-primary/5'
                  : 'border-border/80'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                  Popular
                </div>
              )}
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">{tier.name}</CardTitle>
                <CardDescription>{tier.description}</CardDescription>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">{tier.price}</span>
                  <span className="text-muted-foreground">{tier.period}</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {tier.features.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm">
                    <Check className="size-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </div>
                ))}
              </CardContent>
              <CardFooter className="pt-4">
                <Button
                  asChild
                  className="w-full"
                  variant={tier.highlighted ? 'default' : 'outline'}
                  size="lg"
                >
                  <Link href={`/signup?tier=${tier.id}`}>{tier.cta}</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
      <MarketingFooter />
    </div>
  );
}
