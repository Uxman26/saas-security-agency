'use client';

import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AboutContent() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="about" />
      <section className="border-b border-border/50 py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <Eyebrow>About ControlOps</Eyebrow>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">Built to simplify shift-based service operations</h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            ControlOps gives service businesses one place to manage the people, locations, rotas, records, rates and financial processes behind shift-based work.
          </p>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            The platform is adaptable across service industries while providing specialist workflows for security companies.
          </p>
        </div>
      </section>
      <section className="py-16 border-b border-border/50 bg-muted/20">
        <div className="container mx-auto px-4 max-w-4xl grid md:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Practical software for operational teams</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground leading-relaxed">
              ControlOps is developed to help operational teams replace disconnected spreadsheets and repetitive administration with one clearer source of operational information.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Our mission</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground leading-relaxed">
              Our mission is to make capable workforce operations software accessible to growing service businesses without forcing them to adopt expensive or difficult enterprise systems.
            </CardContent>
          </Card>
        </div>
      </section>
      <section className="py-16 border-b border-border/50">
        <div className="container mx-auto px-4 max-w-4xl grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-bold">Designed for businesses where every shift matters</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              ControlOps is designed for security, cleaning, facilities management, event staffing, temporary staffing and other multi-site service businesses that coordinate people across shifts and client locations.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Deep support for security operations</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Security remains a core ControlOps specialism. Security companies can manage guards, SIA licence information, right-to-work records, subcontractors, client sites, assignments, rates, payroll information and invoicing from the same platform.
            </p>
          </div>
        </div>
      </section>
      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <MarketingCta href="/book-demo">See whether ControlOps fits your operation</MarketingCta>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
