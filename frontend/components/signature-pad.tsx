'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Point = { x: number; y: number };

export function SignaturePad({
  value,
  onChange,
  label = 'Digital signature',
  className,
  height = 180,
}: {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
  className?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [undone, setUndone] = useState<Point[][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(value?.startsWith('data:image') ? value : null);
  const active = useRef<Point[]>([]);

  const redraw = useCallback((all: Point[][]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(12, rect.height * 0.78);
    ctx.lineTo(rect.width - 12, rect.height * 0.78);
    ctx.stroke();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of all) {
      if (!stroke.length) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    if (!confirmed) redraw(strokes);
  }, [strokes, confirmed, redraw]);

  useEffect(() => {
    if (value?.startsWith('data:image')) setConfirmed(value);
  }, [value]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const clear = () => {
    setStrokes([]);
    setUndone([]);
    setConfirmed(null);
    onChange(null);
    requestAnimationFrame(() => redraw([]));
  };

  const undo = () => {
    if (confirmed) {
      setConfirmed(null);
      onChange(null);
      setStrokes([]);
      setUndone([]);
      requestAnimationFrame(() => redraw([]));
      return;
    }
    setStrokes((prev) => {
      if (!prev.length) return prev;
      const next = prev.slice(0, -1);
      const last = prev[prev.length - 1];
      setUndone((u) => [...u, last]);
      requestAnimationFrame(() => redraw(next));
      return next;
    });
  };

  const redo = () => {
    setUndone((u) => {
      if (!u.length) return u;
      const last = u[u.length - 1];
      const rest = u.slice(0, -1);
      setStrokes((s) => {
        const next = [...s, last];
        requestAnimationFrame(() => redraw(next));
        return next;
      });
      return rest;
    });
  };

  const confirm = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!strokes.length && !confirmed) return;
    const dataUrl = canvas.toDataURL('image/png');
    setConfirmed(dataUrl);
    onChange(dataUrl);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <Label>{label}</Label>
      <div className="rounded-md border bg-white overflow-hidden" style={{ height }}>
        {confirmed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={confirmed} alt="Signature" className="h-full w-full object-contain bg-white" />
        ) : (
          <canvas
            ref={canvasRef}
            className="h-full w-full touch-none cursor-crosshair"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrawing(true);
              active.current = [pos(e)];
            }}
            onPointerMove={(e) => {
              if (!drawing) return;
              active.current.push(pos(e));
              redraw([...strokes, active.current]);
            }}
            onPointerUp={() => {
              setDrawing(false);
              if (active.current.length) {
                setStrokes((s) => [...s, active.current]);
                setUndone([]);
              }
              active.current = [];
            }}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          Clear
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={undo}>
          Undo
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={redo} disabled={!undone.length || !!confirmed}>
          Redo
        </Button>
        <Button type="button" size="sm" onClick={confirm} disabled={!!confirmed || strokes.length === 0}>
          {confirmed ? 'Confirmed' : 'Confirm'}
        </Button>
      </div>
      {confirmed ? (
        <p className="text-xs text-muted-foreground">Signature saved — use Clear or Undo to change it.</p>
      ) : null}
    </div>
  );
}
