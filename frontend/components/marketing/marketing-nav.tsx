import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Shield } from 'lucide-react';

type Props = { active?: 'home' | 'about' | 'pricing' };

export function MarketingNav({ active }: Props) {
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
        <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
          <Shield className="size-5 text-primary" />
          Security Agency
        </Link>
        <div className="hidden sm:flex items-center gap-6 text-sm">
          {link('/', 'Home', 'home')}
          {link('/about', 'About', 'about')}
          {link('/pricing', 'Pricing', 'pricing')}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden sm:block">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
