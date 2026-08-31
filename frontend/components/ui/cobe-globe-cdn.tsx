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
  /** Floating site name badge on the arc midpoint. */
  badge: string;
};

type Props = {
  className?: string;
  dark?: boolean;
  markers?: GlobeCdnMarker[];
  arcs?: GlobeCdnArc[];
};

/** Brand orange — ControlOps `#F45100` / `#FF6A1F`. */
const ORANGE: [number, number, number] = [224 / 255, 78 / 255, 0];
const ORANGE_SOFT: [number, number, number] = [253 / 255, 128 / 255, 24 / 255];

/**
 * Globally spaced markers (keeps arcs long & readable).
 * Labels mirror Sites examples used across ControlOps.
 */
const DEFAULT_MARKERS: GlobeCdnMarker[] = [
  { id: 'london', location: [51.5074, -0.1278], label: 'london' },
  { id: 'manchester', location: [53.4808, -2.2426], label: 'manchester' },
  { id: 'dubai', location: [25.2048, 55.2708], label: 'dubai' },
  { id: 'singapore', location: [1.3521, 103.8198], label: 'singapore' },
  { id: 'tokyo', location: [35.6762, 139.6503], label: 'tokyo' },
  { id: 'sydney', location: [-33.8688, 151.2093], label: 'sydney' },
];

const DEFAULT_ARCS: GlobeCdnArc[] = [
  {
    id: 'lon-man',
    from: [51.5074, -0.1278],
    to: [53.4808, -2.2426],
    badge: 'City Centre Office',
  },
  {
    id: 'lon-dxb',
    from: [51.5074, -0.1278],
    to: [25.2048, 55.2708],
    badge: 'Canary Wharf',
  },
  {
    id: 'man-sin',
    from: [53.4808, -2.2426],
    to: [1.3521, 103.8198],
    badge: 'Retail Park',
  },
  {
    id: 'dxb-sin',
    from: [25.2048, 55.2708],
    to: [1.3521, 103.8198],
    badge: 'Warehouse Gate A',
  },
  {
    id: 'sin-tyo',
    from: [1.3521, 103.8198],
    to: [35.6762, 139.6503],
    badge: 'Hospital Wing',
  },
  {
    id: 'tyo-syd',
    from: [35.6762, 139.6503],
    to: [-33.8688, 151.2093],
    badge: 'Airport Terminal',
  },
];

/**
 * Globe CDN — orange site markers + long connection arcs with site badges.
 */
export function GlobeCdn({
  className,
  dark = false,
  markers = DEFAULT_MARKERS,
  arcs = DEFAULT_ARCS,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const phiRef = useRef(2.35);
  const pointerRef = useRef({
    dragging: false,
    lastX: 0,
    velocity: 0,
  });

  const markerColor = useMemo((): [number, number, number] => ORANGE, []);
  const arcColor = useMemo(
    (): [number, number, number] => (dark ? ORANGE_SOFT : ORANGE),
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
      theta: 0.28,
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
        size: 0.022,
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
      // Thin, low arcs — reads as connection lines, not “arrows”
      arcWidth: 0.35,
      arcHeight: 0.22,
      markerElevation: 0.01,
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
        theta: 0.28,
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

      {/* Compact upward pin — not elongated arrows */}
      {markers.map((m) => (
        <div
          key={m.id}
          className="pointer-events-none absolute z-10 flex flex-col items-center gap-0.5 transition-[opacity,filter] duration-300"
          style={
            {
              positionAnchor: `--cobe-${m.id}`,
              bottom: 'anchor(top)',
              left: 'anchor(center)',
              translate: '-50% -6px',
              opacity: `var(--cobe-visible-${m.id}, 0)`,
              filter: `blur(calc((1 - var(--cobe-visible-${m.id}, 0)) * 6px))`,
            } as React.CSSProperties
          }
        >
          <span
            className="block size-0 border-x-[3.5px] border-b-[6px] border-x-transparent border-b-[#F45100]"
            aria-hidden
          />
          <span className="whitespace-nowrap font-mono text-[9px] font-medium lowercase tracking-tight text-[#F45100]">
            {m.label}
          </span>
        </div>
      ))}

      {/* Site name badges */}
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
              'inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-tight shadow-sm',
              dark ? 'bg-[#F45100] text-white' : 'bg-zinc-900 text-white',
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
