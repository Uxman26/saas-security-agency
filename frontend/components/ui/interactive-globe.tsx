'use client';

import { useEffect, useRef } from 'react';
import createGlobe from 'cobe';
import { cn } from '@/lib/utils';

export type GlobeMarker = {
  id: string;
  location: [number, number];
  label: string;
  size?: number;
};

type Props = {
  size?: number;
  className?: string;
  markers?: GlobeMarker[];
  dark?: boolean;
};

const DEFAULT_MARKERS: GlobeMarker[] = [
  { id: 'london', location: [51.5074, -0.1278], label: 'London', size: 0.06 },
  { id: 'manchester', location: [53.4808, -2.2426], label: 'Manchester', size: 0.04 },
  { id: 'dubai', location: [25.2048, 55.2708], label: 'Dubai', size: 0.05 },
  { id: 'delhi', location: [28.6139, 77.209], label: 'Delhi', size: 0.045 },
  { id: 'riyadh', location: [24.7136, 46.6753], label: 'Riyadh', size: 0.045 },
  { id: 'sao', location: [-23.5505, -46.6333], label: 'Sao Paulo', size: 0.045 },
  { id: 'nyc', location: [40.7128, -74.006], label: 'New York', size: 0.05 },
  { id: 'singapore', location: [1.3521, 103.8198], label: 'Singapore', size: 0.04 },
];

/** Interactive COBE globe — 21st.dev Interactive Globe pattern (Yad Hakim / COBE). */
export function InteractiveGlobe({
  size = 460,
  className,
  markers = DEFAULT_MARKERS,
  dark = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({
    dragging: false,
    lastX: 0,
    phi: 0,
    theta: 0.25,
    velocity: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let width = size * 2;
    const ptr = pointerRef.current;
    ptr.phi = 2.4;
    ptr.theta = 0.28;

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width,
      height: width,
      phi: ptr.phi,
      theta: ptr.theta,
      dark: dark ? 1 : 0,
      diffuse: dark ? 1.1 : 1.4,
      mapSamples: 16000,
      mapBrightness: dark ? 4 : 8,
      mapBaseBrightness: dark ? 0.05 : 0.08,
      baseColor: dark ? [0.12, 0.14, 0.18] : [0.92, 0.93, 0.95],
      markerColor: [0.88, 0.3, 0.02],
      glowColor: dark ? [0.08, 0.1, 0.14] : [0.97, 0.97, 0.98],
      markers: markers.map((m) => ({
        location: m.location,
        size: m.size ?? 0.045,
        id: m.id,
        color: [0.88, 0.3, 0.02] as [number, number, number],
      })),
      arcs: [
        { from: [51.5074, -0.1278], to: [25.2048, 55.2708], id: 'lon-dxb' },
        { from: [51.5074, -0.1278], to: [40.7128, -74.006], id: 'lon-nyc' },
        { from: [25.2048, 55.2708], to: [28.6139, 77.209], id: 'dxb-del' },
        { from: [53.4808, -2.2426], to: [24.7136, 46.6753], id: 'man-ruh' },
        { from: [1.3521, 103.8198], to: [-23.5505, -46.6333], id: 'sin-sao' },
      ],
      arcColor: [0.88, 0.35, 0.05],
      arcWidth: 0.55,
      arcHeight: 0.28,
      markerElevation: 0.015,
      onRender: (state: { phi?: number; theta?: number }) => {
        if (!ptr.dragging) {
          ptr.phi += 0.003 + ptr.velocity;
          ptr.velocity *= 0.93;
        }
        state.phi = ptr.phi;
        state.theta = ptr.theta;
      },
    } as Parameters<typeof createGlobe>[1] & {
      onRender: (state: { phi?: number; theta?: number }) => void;
    });

    const onDown = (e: PointerEvent) => {
      ptr.dragging = true;
      ptr.lastX = e.clientX;
      ptr.velocity = 0;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!ptr.dragging) return;
      const dx = e.clientX - ptr.lastX;
      ptr.lastX = e.clientX;
      ptr.phi += dx / 200;
      ptr.velocity = dx / 800;
    };
    const onUp = (e: PointerEvent) => {
      ptr.dragging = false;
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

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      globe.destroy();
    };
  }, [size, dark, markers]);

  return (
    <div
      className={cn('relative mx-auto select-none', className)}
      style={{ width: size, height: size, maxWidth: '100%' }}
    >
      <canvas
        ref={canvasRef}
        width={size * 2}
        height={size * 2}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        style={{ contain: 'layout paint size' }}
        aria-label="Interactive globe"
      />
      {/* City labels (decorative; globe itself is interactive) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {markers.slice(0, 5).map((m, i) => (
          <span
            key={m.id}
            className="absolute rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur-sm"
            style={{
              top: `${18 + ((i * 17) % 55)}%`,
              left: i % 2 === 0 ? `${8 + (i % 3) * 6}%` : undefined,
              right: i % 2 === 1 ? `${10 + (i % 3) * 5}%` : undefined,
              opacity: 0.85,
            }}
          >
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export { InteractiveGlobe as Component };
