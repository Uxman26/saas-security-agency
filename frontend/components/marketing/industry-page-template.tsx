import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Props = {
  activeNav?: 'industries';
  eyebrow: string;
  title: string;
  paragraph: string;
  cta: string;
  disclaimer?: string;
  problems: { title: string; text: string }[];
  capabilities: { title: string; text: string }[];
  workflow: string[];
  faqs: { q: string; a: string }[];
};

export function IndustryPageTemplate({
  activeNav = 'industries',
  eyebrow,
  title,
  paragraph,
  cta,
  disclaimer,
  problems,
  capabilities,
  workflow,
  faqs,
}: Props) {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active={activeNav} />
      <section className="border-b border-border/50 py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{title}</h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">{paragraph}</p>
          <div className="mt-8">
            <MarketingCta href="/book-demo">{cta}</MarketingCta>
          </div>
          {disclaimer && (
            <p className="mt-8 text-sm text-muted-foreground border-l-4 border-primary/30 pl-4">{disclaimer}</p>
          )}
        </div>
      </section>
      <section className="py-16 bg-muted/20 border-b border-border/50">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-2xl font-bold mb-8">Common operational challenges</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {problems.map((p) => (
              <Card key={p.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{p.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{p.text}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      <section className="py-16 border-b border-border/50">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-2xl font-bold mb-8">Relevant ControlOps capabilities</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {capabilities.map((c) => (
              <div key={c.title} className="rounded-xl border p-5">
                <h3 className="font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="py-16 bg-muted/20 border-b border-border/50">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-2xl font-bold mb-6">Typical workflow</h2>
          <ol className="space-y-4">
            {workflow.map((step, i) => (
              <li key={i} className="flex gap-4 text-muted-foreground">
                <span className="font-bold text-primary shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="py-16 border-b border-border/50">
        <div className="container mx-auto px-4 max-w-3xl space-y-4">
          <h2 className="text-2xl font-bold mb-6">FAQs</h2>
          {faqs.map((f) => (
            <div key={f.q} className="rounded-xl border p-5">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="py-16">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-2xl font-bold">See ControlOps for your operation</h2>
          <p className="mt-4 text-muted-foreground">Book a tailored demonstration using your workforce, locations and billing requirements.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <MarketingCta href="/book-demo">{cta}</MarketingCta>
            <MarketingCta href="/pricing" variant="outline">View pricing</MarketingCta>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
