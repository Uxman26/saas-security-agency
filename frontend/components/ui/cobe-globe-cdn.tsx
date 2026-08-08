'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import createGlobe from 'cobe';
import { cn } from '@/lib/utils';

export type GlobeCdnMarker = {
  id: string;
  location: [number, number];
  label: string;
};

export type GlobeCdnArc = {
  id: string;
  from: [number, number];
  to: [number, number];
  /** Shown as a floating badge on the arc midpoint (e.g. "448k req/s"). */
  badge: string;
};

type Props = {
  className?: string;
  dark?: boolean;
  markers?: GlobeCdnMarker[];
  arcs?: GlobeCdnArc[];
};

/** Vercel / 21st.dev Globe CDN edge regions. */
const DEFAULT_MARKERS: GlobeCdnMarker[] = [
  { id: 'dub1', location: [53.3498, -6.2603], label: 'dub1' },
  { id: 'cdg1', location: [49.0097, 2.5479], label: 'cdg1' },
  { id: 'bom1', location: [19.076, 72.8777], label: 'bom1' },
  { id: 'sin1', location: [1.3521, 103.8198], label: 'sin1' },
  { id: 'hnd1', location: [35.5494, 139.7798], label: 'hnd1' },
  { id: 'syd1', location: [-33.8688, 151.2093], label: 'syd1' },
];

const DEFAULT_ARCS: GlobeCdnArc[] = [
  {
    id: 'dub-cdg',
    from: [53.3498, -6.2603],
    to: [49.0097, 2.5479],
    badge: '448k req/s',
  },
  {
    id: 'cdg-bom',
    from: [49.0097, 2.5479],
    to: [19.076, 72.8777],
    badge: '306k req/s',
  },
  {
    id: 'bom-sin',
    from: [19.076, 72.8777],
    to: [1.3521, 103.8198],
    badge: '372k req/s',
  },
  {
    id: 'sin-hnd',
    from: [1.3521, 103.8198],
    to: [35.5494, 139.7798],
    badge: '224k req/s',
  },
  {
    id: 'hnd-syd',
    from: [35.5494, 139.7798],
    to: [-33.8688, 151.2093],
    badge: '221k req/s',
  },
  {
    id: 'dub-sin',
    from: [53.3498, -6.2603],
    to: [1.3521, 103.8198],
    badge: '198k req/s',
  },
];

/**
 * Globe CDN — dotted WebGL globe with triangle edge markers, arc badges,
 * and CSS Anchor Positioning (cobe v2 / 21st.dev Globe CDN pattern).
 */
export function GlobeCdn({
  className,
  dark = false,
  markers = DEFAULT_MARKERS,
  arcs = DEFAULT_ARCS,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const phiRef = useRef(2.6);
  const pointerRef = useRef({
    dragging: false,
    lastX: 0,
    velocity: 0,
  });

  const markerColor = useMemo(
    (): [number, number, number] => (dark ? [0.92, 0.93, 0.95] : [0.08, 0.09, 0.11]),
    [dark],
  );
  const arcColor = useMemo(
    (): [number, number, number] => (dark ? [0.75, 0.78, 0.82] : [0.12, 0.13, 0.15]),
    [dark],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let width = container.offsetWidth || 520;
    const dpr = Math.min(window.devicePixelRatio || 2, 2);

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: width * 2,
      height: width * 2,
      phi: phiRef.current,
      theta: 0.22,
      dark: dark ? 1 : 0,
      diffuse: dark ? 1.15 : 1.35,
      mapSamples: 18000,
      mapBrightness: dark ? 5.5 : 9,
      mapBaseBrightness: dark ? 0.04 : 0.06,
      baseColor: dark ? [0.14, 0.15, 0.18] : [0.96, 0.96, 0.97],
      markerColor,
      glowColor: dark ? [0.08, 0.09, 0.11] : [0.97, 0.97, 0.98],
      scale: 1.05,
      markers: markers.map((m) => ({
        location: m.location,
        size: 0.012,
        id: m.id,
        color: markerColor,
      })),
      arcs: arcs.map((a) => ({
        from: a.from,
        to: a.to,
        id: a.id,
        color: arcColor,
      })),
      arcColor,
      arcWidth: 0.45,
      arcHeight: 0.32,
      markerElevation: 0.012,
    });

    let raf = 0;
    const tick = () => {
      const ptr = pointerRef.current;
      if (!ptr.dragging) {
        phiRef.current += 0.0028 + ptr.velocity;
        ptr.velocity *= 0.92;
      }
      width = container.offsetWidth || width;
      globe.update({
        phi: phiRef.current,
        theta: 0.22,
        width: width * 2,
        height: width * 2,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onDown = (e: PointerEvent) => {
      pointerRef.current.dragging = true;
      pointerRef.current.lastX = e.clientX;
      pointerRef.current.velocity = 0;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!pointerRef.current.dragging) return;
      const dx = e.clientX - pointerRef.current.lastX;
      pointerRef.current.lastX = e.clientX;
      phiRef.current += dx / 220;
      pointerRef.current.velocity = dx / 900;
    };
    const onUp = (e: PointerEvent) => {
      pointerRef.current.dragging = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    const onResize = () => {
      width = container.offsetWidth || width;
      globe.update({ width: width * 2, height: width * 2 });
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      globe.destroy();
    };
  }, [dark, markers, arcs, markerColor, arcColor]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative mx-auto aspect-square w-full max-w-[560px] select-none lg:max-w-[640px]',
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        style={{ contain: 'layout paint size', width: '100%', height: '100%' }}
        aria-label="Global operations globe"
      />

      {/* Triangle markers + region labels (CSS Anchor Positioning via cobe ids) */}
      {markers.map((m) => (
        <div
          key={m.id}
          className="pointer-events-none absolute z-10 flex flex-col items-center gap-0.5 transition-[opacity,filter] duration-300"
          style={
            {
              positionAnchor: `--cobe-${m.id}`,
              bottom: 'anchor(top)',
              left: 'anchor(center)',
              translate: '-50% -8px',
              opacity: `var(--cobe-visible-${m.id}, 0)`,
              filter: `blur(calc((1 - var(--cobe-visible-${m.id}, 0)) * 6px))`,
            } as React.CSSProperties
          }
        >
          <span
            className={cn(
              'block size-0 border-x-[4px] border-b-[7px] border-x-transparent',
              dark ? 'border-b-zinc-100' : 'border-b-zinc-900',
            )}
            aria-hidden
          />
          <span
            className={cn(
              'font-mono text-[10px] font-medium lowercase tracking-tight',
              dark ? 'text-zinc-200' : 'text-zinc-800',
            )}
          >
            {m.label}
          </span>
        </div>
      ))}

      {/* Live traffic badges on arcs */}
      {arcs.map((a) => (
        <div
          key={a.id}
          className="pointer-events-none absolute z-20 transition-[opacity,filter] duration-300"
          style={
            {
              positionAnchor: `--cobe-arc-${a.id}`,
              bottom: 'anchor(top)',
              left: 'anchor(center)',
              translate: '-50% -10px',
              opacity: `var(--cobe-visible-arc-${a.id}, 0)`,
              filter: `blur(calc((1 - var(--cobe-visible-arc-${a.id}, 0)) * 6px))`,
            } as React.CSSProperties
          }
        >
          <span
            className={cn(
              'inline-block rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-tight shadow-sm',
              dark
                ? 'bg-zinc-100 text-zinc-900'
                : 'bg-zinc-900 text-white',
            )}
          >
            {a.badge}
          </span>
        </div>
      ))}
    </div>
  );
}

export { GlobeCdn as Component };
