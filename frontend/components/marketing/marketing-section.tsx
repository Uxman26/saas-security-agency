import { cn } from '@/lib/utils';
import { Eyebrow } from '@/components/marketing/marketing-cta';

type SectionProps = {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'muted' | 'hero' | 'accent' | 'cta';
  border?: boolean;
};

const variants = {
  default: 'bg-background',
  muted: 'bg-muted/30',
  hero: 'marketing-hero-bg bg-background',
  accent: 'marketing-accent-bg bg-background',
  cta: 'marketing-cta-bg',
};

export function MarketingSection({
  children,
  className,
  variant = 'default',
  border = true,
}: SectionProps) {
  return (
    <section
      className={cn(
        'relative py-16 md:py-20 overflow-hidden',
        variants[variant],
        border && 'border-b border-border/50',
        className
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'left',
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-10 md:mb-12',
        align === 'center' && 'text-center mx-auto max-w-3xl',
        align === 'left' && 'max-w-3xl',
        className
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{title}</h2>
      {subtitle && (
        <div className="mt-4 text-lg text-muted-foreground leading-relaxed">{subtitle}</div>
      )}
    </div>
  );
}
