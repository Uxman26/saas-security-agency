'use client';

import { Component, Suspense, lazy, useCallback, type ReactNode } from 'react';
import type { Application } from '@splinetool/runtime';
import { cn } from '@/lib/utils';

const Spline = lazy(() => import('@splinetool/react-spline'));

type Props = {
  scene: string;
  className?: string;
};

const GROUND_NAME_RE =
  /ground|floor|plane|platform|base|pedestal|stand|shadow|bg|background|terrain|badge|watermark|logo|spline/i;

function hideSplineWatermark(root: HTMLElement | null) {
  if (!root) return;

  root.querySelectorAll('a').forEach((el) => {
    const href = (el.getAttribute('href') || '').toLowerCase();
    const text = (el.textContent || '').toLowerCase();
    if (href.includes('spline') || text.includes('spline') || text.includes('built with')) {
      el.remove();
    }
  });

  root.querySelectorAll('div, span, button, p').forEach((el) => {
    const text = (el.textContent || '').trim().toLowerCase();
    if (!text) return;
    if (
      text === 'built with spline' ||
      text === 'spline' ||
      (text.includes('built with') && text.includes('spline'))
    ) {
      const target = (el.closest('a') || el) as HTMLElement;
      target.style.setProperty('display', 'none', 'important');
      target.style.setProperty('visibility', 'hidden', 'important');
      target.style.setProperty('opacity', '0', 'important');
      target.style.setProperty('pointer-events', 'none', 'important');
      target.remove();
    }
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
    'Built with Spline',
  ]) {
    const obj = app.findObjectByName(name);
    if (obj) obj.visible = false;
  }
}

/** Nudge Whobee purple/magenta materials toward ControlOps orange via CSS filter. */
const ORANGE_BOT_FILTER =
  'hue-rotate(118deg) saturate(1.55) brightness(1.14) contrast(1.04)';

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
            background: 'linear-gradient(160deg, #FB923C 0%, #F45100 55%, #C2410C 100%)',
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

class SplineErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { error: boolean }
> {
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

    const root = document.querySelector('[data-spline-robot]') as HTMLElement | null;
    hideSplineWatermark(root);

    const observer = new MutationObserver(() => hideSplineWatermark(root));
    if (root) observer.observe(root, { childList: true, subtree: true });

    // Spline often re-injects the badge after a delay
    const timers = [500, 1500, 3000, 6000].map((ms) =>
      window.setTimeout(() => hideSplineWatermark(root), ms)
    );
    window.setTimeout(() => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    }, 7000);
  }, []);

  return (
    <div
      data-spline-robot
      className={cn(
        'relative overflow-hidden bg-transparent',
        '[&_a]:!pointer-events-none [&_a]:!absolute [&_a]:!-z-10 [&_a]:!opacity-0',
        '[&_a[href*="spline"]]:!hidden',
        className
      )}
    >
      {/* Opaque mask over Built-with-Spline badge — matches page black / light bg */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 end-0 z-30 h-[72px] w-[180px] bg-background dark:bg-[#0F172A]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 end-0 z-30 h-20 w-48 bg-gradient-to-tl from-background from-50% via-background/90 to-transparent dark:from-[#0F172A] dark:via-[#0F172A]/95"
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
            className="h-full w-full origin-center scale-[1.05] bg-transparent [&_canvas]:bg-transparent"
            style={{ filter: ORANGE_BOT_FILTER }}
          >
            <Spline scene={scene} className="h-full w-full bg-transparent" onLoad={onLoad} />
          </div>
        </Suspense>
      </SplineErrorBoundary>
    </div>
  );
}
