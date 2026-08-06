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
  nav: 'h-14 w-auto sm:h-16 md:h-[4.25rem] max-h-[4.25rem] object-contain object-left',
  default: 'h-14 w-auto sm:h-16 md:h-[4.5rem] object-contain object-left',
} as const;

const LOGO = {
  horizontal: {
    light: '/ControlOps-Logos/controlOps-horizontal-logo.png',
    dark: '/ControlOps-Logos/controlOps-horizontal-logo-dark.png',
    width: 1505,
    height: 409,
  },
  icon: {
    light: '/ControlOps-Logos/controlOps-logo.png',
    dark: '/ControlOps-Logos/controlOps-logo-dark.png',
    width: 931,
    height: 851,
  },
} as const;

export function MarketingBrand({ className, variant = 'horizontal', linked = true, size = 'default' }: Props) {
  const asset = LOGO[variant];
  const sizeClass =
    variant === 'horizontal'
      ? horizontalClass[size]
      : size === 'nav'
        ? 'h-14 w-auto sm:h-16 object-contain'
        : 'h-14 w-auto sm:h-16 object-contain';

  const img = (
    <>
      <Image
        src={asset.light}
        alt="ControlOps workforce operations platform"
        width={asset.width}
        height={asset.height}
        className={cn(sizeClass, 'dark:hidden')}
        priority
      />
      <Image
        src={asset.dark}
        alt="ControlOps workforce operations platform"
        width={asset.width}
        height={asset.height}
        className={cn(sizeClass, 'hidden dark:block')}
        priority
      />
    </>
  );

  if (!linked) return <div className={cn('flex shrink-0 items-center', className)}>{img}</div>;

  return (
    <Link href="/" className={cn('flex shrink-0 items-center', className)}>
      {img}
    </Link>
  );
}
