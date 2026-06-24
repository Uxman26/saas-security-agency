import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketingBrand } from '@/components/marketing/marketing-brand';

export function MarketingFooter() {
  const t = useTranslations('common');
  const f = useTranslations('footer');

  return (
    <footer className="border-t border-border/50 py-12 bg-muted/20">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <div>
            <MarketingBrand linked={false} />
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">{f('tagline')}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">{t('home')}</Link>
            <Link href="/about" className="hover:text-foreground transition-colors">{t('about')}</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">{t('pricing')}</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">{t('signUp')}</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">{t('signIn')}</Link>
          </div>
          <Button asChild size="sm" className="gap-1.5 shrink-0">
            <Link href="/pricing">
              {t('getStarted')} <ArrowRight className="size-3.5 rtl:rotate-180" />
            </Link>
          </Button>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground md:text-start">
          © {new Date().getFullYear()} {f('copyright')}
        </p>
      </div>
    </footer>
  );
}
