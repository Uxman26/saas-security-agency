import Link from 'next/link';
import { Shield, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/50 py-12 bg-muted/20">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <div>
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Shield className="size-5 text-primary" />
              Security Agency SAAS
            </div>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
              Built by Paramount Tech for UK security companies who need compliance, payroll and billing in one platform.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Sign up</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
          </div>
          <Button asChild size="sm" className="gap-1.5 shrink-0">
            <Link href="/pricing">
              Get started <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground md:text-left">
          © {new Date().getFullYear()} Paramount Tech. Security company management platform.
        </p>
      </div>
    </footer>
  );
}
