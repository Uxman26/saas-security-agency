'use client';

import { Component, Suspense, lazy, useCallback, type ReactNode } from 'react';
import type { Application } from '@splinetool/runtime';
import { cn } from '@/lib/utils';

const Spline = lazy(() => import('@splinetool/react-spline'));

type Props = {
  scene: string;
  className?: string;
};

const GROUND_NAME_RE = /ground|floor|plane|platform|base|pedestal|stand|shadow|bg|background|terrain/i;

function hideSplineWatermark(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll('a[href*="spline"]').forEach((el) => el.remove());
  root.querySelectorAll('[class*="logo"], [id*="logo"]').forEach((el) => {
    const t = (el.textContent || '').toLowerCase();
    if (t.includes('spline') || t.includes('built with')) el.remove();
  });
}

function hideGroundObjects(app: Application) {
  const objects = app.getAllObjects();
  for (const obj of objects) {
    const name = obj.name || '';
    if (GROUND_NAME_RE.test(name)) {
      obj.visible = false;
    }
  }

  // Extra explicit names commonly used in Whobee / Spline demos
  for (const name of [
    'Ground',
    'ground',
    'Floor',
    'Plane',
    'Platform',
    'Base',
    'Rectangle',
    'Triangle',
    'Cube 2',
    'Floor Plane',
    'Shadow Catcher',
  ]) {
    const obj = app.findObjectByName(name);
    if (obj) obj.visible = false;
  }
}

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
  const onLoad = useCallback((app: Application) => {
    hideGroundObjects(app);

    // Watermark is a DOM overlay injected after load — strip it and watch for re-inject
    const root = document.querySelector('[data-spline-robot]') as HTMLElement | null;
    hideSplineWatermark(root);
    const observer = new MutationObserver(() => hideSplineWatermark(root));
    if (root) observer.observe(root, { childList: true, subtree: true });
    window.setTimeout(() => {
      hideSplineWatermark(root);
      observer.disconnect();
    }, 4000);
  }, []);

  return (
    <div
      data-spline-robot
      className={cn(
        'relative bg-transparent',
        // Hide Built with Spline badge (DOM watermark)
        '[&_a[href*="spline"]]:!hidden [&_a[href*="spline.design"]]:!pointer-events-none [&_a[href*="spline.design"]]:!opacity-0',
        className
      )}
    >
      {/* Cover residual "Built with Spline" watermark */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 end-0 z-20 h-12 w-40 bg-background"
      />

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
            className="h-full w-full bg-transparent [&_canvas]:bg-transparent"
            style={{
              // Shift Spline magenta/purple accents toward ControlOps orange
              filter: 'hue-rotate(95deg) saturate(1.15) brightness(1.02)',
            }}
          >
            <Spline scene={scene} className="h-full w-full bg-transparent" onLoad={onLoad} />
          </div>
        </Suspense>
      </SplineErrorBoundary>
    </div>
  );
}
