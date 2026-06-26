import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MarketingCta({
  href,
  children,
  variant = 'default',
  size = 'lg',
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'default' | 'outline';
  size?: 'default' | 'lg' | 'sm';
}) {
  return (
    <Button
      asChild
      variant={variant}
      size={size}
      className={cn(
        variant === 'default' && 'gap-2 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25',
        variant === 'outline' && 'border-primary/30 hover:bg-primary/5'
      )}
    >
      <Link href={href}>
        {children}
        {variant === 'default' && <ArrowRight className="size-4 rtl:rotate-180" />}
      </Link>
    </Button>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-1.5 text-sm font-medium text-primary shadow-sm">
      {children}
    </div>
  );
}
