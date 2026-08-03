'use client';

import { Component, Suspense, lazy, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const Spline = lazy(() => import('@splinetool/react-spline'));

type Props = {
  scene: string;
  className?: string;
};

function RobotFallback({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center bg-transparent', className)} aria-hidden>
      <div className="relative size-40 md:size-52">
        <div
          className="absolute inset-x-8 bottom-0 h-3 rounded-full opacity-60 blur-md"
          style={{ background: 'radial-gradient(ellipse, rgba(224,78,0,0.55), transparent 70%)' }}
        />
        <div className="absolute inset-x-[28%] top-[42%] bottom-[18%] rounded-lg bg-[#1a1f28] shadow-xl" />
        <div
          className="absolute inset-x-[22%] top-[12%] h-[38%] rounded-2xl border border-white/10 shadow-lg"
          style={{
            background: 'linear-gradient(160deg, #E8590C 0%, #DF3C01 55%, #9a2a00 100%)',
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center gap-5">
            <span className="size-5 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,0.8)]" />
            <span className="size-5 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,0.8)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

class SplineErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { error: boolean }> {
  state = { error: false };

  static getDerivedStateFromError() {
    return { error: true };
  }

  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}

/** Interactive Whobee robot via Spline (21st.dev Interactive 3D Robot pattern). */
export function InteractiveRobotSpline({ scene, className }: Props) {
  return (
    <div className={cn('relative', className)}>
      <SplineErrorBoundary fallback={<RobotFallback className="h-full w-full" />}>
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center">
              <div
                className="size-10 animate-pulse rounded-full"
                style={{ background: 'rgba(224,78,0,0.35)' }}
              />
            </div>
          }
        >
          <div
            className="h-full w-full"
            style={{
              // Shift Spline magenta/purple accents toward ControlOps orange
              filter: 'hue-rotate(95deg) saturate(1.15) brightness(1.02)',
            }}
          >
            <Spline scene={scene} className="h-full w-full" />
          </div>
        </Suspense>
      </SplineErrorBoundary>
    </div>
  );
}
