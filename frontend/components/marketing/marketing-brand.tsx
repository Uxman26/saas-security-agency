import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  variant?: 'horizontal' | 'icon';
  linked?: boolean;
};

export function MarketingBrand({ className, variant = 'horizontal', linked = true }: Props) {
  const img =
    variant === 'horizontal' ? (
      <Image
        src="/ControlOps-Logos/controlOps-horizontal-logo.png"
        alt="ControlOps workforce operations platform"
        width={200}
        height={52}
        className="h-8 w-auto"
        priority
      />
    ) : (
      <Image
        src="/ControlOps-Logos/controlOps-logo.png"
        alt="ControlOps workforce operations platform"
        width={48}
        height={48}
        className="size-10"
        priority
      />
    );

  if (!linked) return <div className={cn('flex items-center', className)}>{img}</div>;

  return (
    <Link href="/" className={cn('flex items-center', className)}>
      {img}
    </Link>
  );
}
