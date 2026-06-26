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
  nav: 'h-11 w-auto sm:h-12 md:h-14 max-h-14',
  default: 'h-10 w-auto sm:h-11',
} as const;

export function MarketingBrand({ className, variant = 'horizontal', linked = true, size = 'default' }: Props) {
  const img =
    variant === 'horizontal' ? (
      <Image
        src="/ControlOps-Logos/controlOps-horizontal-logo.png"
        alt="ControlOps workforce operations platform"
        width={360}
        height={180}
        className={horizontalClass[size]}
        priority
      />
    ) : (
      <Image
        src="/ControlOps-Logos/controlOps-logo.png"
        alt="ControlOps workforce operations platform"
        width={56}
        height={56}
        className={size === 'nav' ? 'size-11 sm:size-12' : 'size-10'}
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
