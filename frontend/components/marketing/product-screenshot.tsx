'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

type Props = {
  alt: string;
  width: number;
  height: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
};

/** Light `/image.png` + dark `/image-dark.png` product screenshot pair. */
export function ProductScreenshot({ alt, width, height, className, sizes, priority }: Props) {
  return (
    <>
      <Image
        src="/image.png"
        alt={alt}
        width={width}
        height={height}
        className={cn('dark:hidden', className)}
        sizes={sizes}
        priority={priority}
      />
      <Image
        src="/image-dark.png"
        alt={alt}
        width={width}
        height={height}
        className={cn('hidden dark:block', className)}
        sizes={sizes}
        priority={priority}
      />
    </>
  );
}
