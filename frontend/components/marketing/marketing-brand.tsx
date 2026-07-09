import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  variant?: 'horizontal' | 'icon';
  linked?: boolean;
  size?: 'nav' | 'default';
};

const horizontalClass = {
  nav: 'h-12 w-auto sm:h-14 md:h-16 max-h-16 object-contain',
  default: 'h-11 w-auto sm:h-12 object-contain',
} as const;

export function MarketingBrand({ className, variant = 'horizontal', linked = true, size = 'default' }: Props) {
  const img =
    variant === 'horizontal' ? (
      <Image
        src="/ControlOps-Logos/controlOps-horizontal-logo.avif"
        alt="ControlOps workforce operations platform"
        width={360}
        height={180}
        className={horizontalClass[size]}
        priority
      />
    ) : (
      <Image
        src="/ControlOps-Logos/controlOps-logo.avif"
        alt="ControlOps workforce operations platform"
        width={72}
        height={72}
        className={size === 'nav' ? 'h-12 w-auto sm:h-14 object-contain' : 'h-11 w-auto object-contain'}
        priority
      />
    );

  if (!linked) return <div className={cn('flex shrink-0 items-center', className)}>{img}</div>;

  return (
    <Link href="/" className={cn('flex shrink-0 items-center', className)}>
      {img}
    </Link>
  );
}
