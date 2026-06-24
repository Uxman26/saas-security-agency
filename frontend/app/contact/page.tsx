import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Contact | ControlOps' };

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <section className="container mx-auto px-4 py-16 md:py-24 max-w-2xl text-center">
        <Eyebrow>Contact</Eyebrow>
        <h1 className="text-3xl font-bold">Get in touch with ControlOps</h1>
        <p className="mt-4 text-muted-foreground">
          Book a demonstration to discuss your workforce, locations, rotas and billing requirements, or contact us about an existing account.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <MarketingCta href="/book-demo">Book a demo</MarketingCta>
          <MarketingCta href="/login" variant="outline">Sign in</MarketingCta>
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          New to ControlOps? <Link href="/pricing" className="text-primary hover:underline">View pricing</Link>
        </p>
      </section>
      <MarketingFooter />
    </div>
  );
}
