'use client';

import { Suspense, lazy } from 'react';
import { cn } from '@/lib/utils';

const Spline = lazy(() => import('@splinetool/react-spline'));

interface SplineSceneProps {
  scene: string;
  className?: string;
}

function SplineFallback({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-full w-full items-center justify-center', className)} aria-hidden>
      <span className="size-8 animate-spin rounded-full border-2 border-[#E04E00]/30 border-t-[#E04E00]" />
    </div>
  );
}

/** Lazy Spline scene loader (21st.dev SplineScene / splite.tsx). */
export function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <Suspense fallback={<SplineFallback className={className} />}>
      <Spline
        scene={scene}
        className={cn(
          className,
          '[&_a[href*="spline"]]:!hidden [&_a[href*="spline.design"]]:!hidden'
        )}
      />
    </Suspense>
  );
}
