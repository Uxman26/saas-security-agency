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
        variant === 'default' && 'gap-2 shadow-sm shadow-foreground/10 hover:shadow-md hover:shadow-foreground/10',
        variant === 'outline' && 'border-border hover:bg-muted'
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
    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/70 px-4 py-1.5 text-sm font-medium text-muted-foreground">
      {children}
    </div>
  );
}
