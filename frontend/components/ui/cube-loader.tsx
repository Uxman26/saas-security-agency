'use client';

import { cn } from '@/lib/utils';

type CubeLoaderProps = {
  className?: string;
  /** Compact overlay size (page transitions). */
  compact?: boolean;
  label?: string;
  description?: string;
};

/**
 * 3D breathing cube loader (21st.dev).
 * Colors follow ControlOps Amber Mono (orange / amber faces).
 */
export default function CubeLoader({
  className,
  compact = false,
  label = 'Loading',
  description = 'Preparing your experience, please wait…',
}: CubeLoaderProps) {
  return (
    <div
      className={cn(
        'cube-loader flex flex-col items-center justify-center perspective-container',
        compact ? 'min-h-0 gap-8 p-6' : 'min-h-[400px] gap-12 p-12',
        className
      )}
      data-compact={compact ? 'true' : undefined}
    >
      <div
        className={cn(
          'relative flex items-center justify-center preserve-3d',
          compact ? 'h-16 w-16' : 'h-24 w-24'
        )}
      >
        <div className="animate-cube-spin relative h-full w-full preserve-3d">
          <div
            className={cn(
              'animate-pulse-fast absolute inset-0 m-auto rounded-full bg-white blur-md',
              'shadow-[0_0_40px_rgba(253,128,24,0.85)]',
              compact ? 'h-5 w-5' : 'h-8 w-8'
            )}
          />

          <div className="side-wrapper front">
            <div className="face border-2 border-primary/80 bg-primary/10 shadow-[0_0_15px_rgba(224,78,0,0.45)]" />
          </div>
          <div className="side-wrapper back">
            <div className="face border-2 border-primary/80 bg-primary/10 shadow-[0_0_15px_rgba(224,78,0,0.45)]" />
          </div>
          <div className="side-wrapper right">
            <div className="face border-2 border-orange-400/80 bg-orange-500/10 shadow-[0_0_15px_rgba(253,128,24,0.4)]" />
          </div>
          <div className="side-wrapper left">
            <div className="face border-2 border-orange-400/80 bg-orange-500/10 shadow-[0_0_15px_rgba(253,128,24,0.4)]" />
          </div>
          <div className="side-wrapper top">
            <div className="face border-2 border-amber-400/70 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.35)]" />
          </div>
          <div className="side-wrapper bottom">
            <div className="face border-2 border-amber-400/70 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.35)]" />
          </div>
        </div>

        <div
          className={cn(
            'animate-shadow-breathe absolute rounded-[100%] bg-black/40 blur-xl',
            compact ? '-bottom-12 h-5 w-16' : '-bottom-20 h-8 w-24'
          )}
        />
      </div>

      <div className="mt-2 flex flex-col items-center gap-1">
        <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
          {label}
        </h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export { CubeLoader };
