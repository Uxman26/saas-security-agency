import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { MarketingBrand } from '@/components/marketing/marketing-brand';
import { LanguageSwitcher } from '@/components/language-switcher';

type Props = { active?: 'home' | 'about' | 'pricing' };

export function MarketingNav({ active }: Props) {
  const t = useTranslations('common');

  const link = (href: string, label: string, key: Props['active']) => (
    <Link
      href={href}
      className={
        active === key
          ? 'text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground transition-colors'
      }
    >
      {label}
    </Link>
  );

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <MarketingBrand />
        <div className="hidden sm:flex items-center gap-6 text-sm">
          {link('/', t('home'), 'home')}
          {link('/about', t('about'), 'about')}
          {link('/pricing', t('pricing'), 'pricing')}
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Link href="/login" className="hidden sm:block">
            <Button variant="ghost" size="sm">{t('signIn')}</Button>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
