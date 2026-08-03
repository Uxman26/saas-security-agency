'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Users,
  MapPin,
  Shield,
  CalendarDays,
  QrCode,
  AlertTriangle,
  Clock,
  FileText,
  Building2,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

gsap.registerPlugin(ScrollTrigger);

export type TimelineModule = {
  id: string;
  category: string;
  title: string;
  description: string;
  href: string;
  image?: 'rota' | 'none';
};

const ICONS: Record<string, LucideIcon> = {
  guards: Users,
  sites: MapPin,
  roles: Shield,
  rota: CalendarDays,
  patrol: QrCode,
  incidents: AlertTriangle,
  attendance: Clock,
  invoices: FileText,
  clients: Building2,
  reports: BarChart3,
};

type Props = {
  events: TimelineModule[];
  learnMore: string;
  className?: string;
};

function TimelineCard({
  event,
  side,
  learnMore,
  active,
}: {
  event: TimelineModule;
  side: 'left' | 'right';
  learnMore: string;
  active: boolean;
}) {
  const Icon = ICONS[event.id] ?? Shield;
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  return (
    <div
      className={cn(
        'group relative w-full max-w-md transition-all duration-500',
        side === 'left' ? 'md:me-auto md:ms-0' : 'md:ms-auto md:me-0',
        active ? 'opacity-100 translate-y-0' : 'opacity-40 translate-y-4'
      )}
      style={{
        transform: active
          ? `perspective(900px) rotateY(${tilt.y}deg) rotateX(${tilt.x}deg)`
          : undefined,
      }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        setTilt({ x: py * -6, y: px * 8 });
      }}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-md shadow-foreground/5 transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-foreground/10">
        {event.image === 'rota' ? (
          <div className="relative aspect-[16/9] overflow-hidden bg-muted">
            <Image
              src="/image.png"
              alt={event.title}
              fill
              className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.03] dark:hidden"
              sizes="(max-width: 768px) 100vw, 28rem"
            />
            <Image
              src="/image-dark.png"
              alt={event.title}
              fill
              className="hidden object-cover object-top transition-transform duration-500 group-hover:scale-[1.03] dark:block"
              sizes="(max-width: 768px) 100vw, 28rem"
            />
            <span
              className="absolute end-3 top-3 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: '#E04E00' }}
            >
              {event.category}
            </span>
          </div>
        ) : (
          <div
            className="relative flex aspect-[16/9] items-center justify-center overflow-hidden"
            style={{
              background:
                'linear-gradient(145deg, rgba(224,78,0,0.12) 0%, rgba(22,30,44,0.06) 45%, rgba(255,255,255,0.9) 100%)',
            }}
          >
            <div
              className="flex size-16 items-center justify-center rounded-2xl text-white shadow-lg"
              style={{ backgroundColor: '#E04E00' }}
            >
              <Icon className="size-8" />
            </div>
            <span
              className="absolute end-3 top-3 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: '#11161D' }}
            >
              {event.category}
            </span>
          </div>
        )}

        <div className="p-5 md:p-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ backgroundColor: '#E04E00' }} />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {event.category}
            </p>
          </div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">{event.title}</h3>
          <p
            className={cn(
              'mt-2 text-sm leading-relaxed text-muted-foreground transition-all duration-300',
              active ? 'line-clamp-none max-h-40 opacity-100' : 'line-clamp-2 max-h-12 opacity-80'
            )}
          >
            {event.description}
          </p>
          <Link
            href={event.href}
            className="mt-4 inline-flex text-sm font-semibold transition-colors hover:opacity-80"
            style={{ color: '#E04E00' }}
          >
            {learnMore} →
          </Link>
        </div>
      </div>
    </div>
  );
}

function TimelineNode({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'relative z-10 flex size-11 items-center justify-center rounded-full border-2 bg-background shadow-md transition-all duration-300',
        active ? 'scale-110 border-transparent text-white' : 'border-border text-muted-foreground'
      )}
      style={active ? { backgroundColor: '#E04E00', boxShadow: '0 0 0 6px rgba(224,78,0,0.18)' } : undefined}
    >
      {children}
    </div>
  );
}

/** Alternating 3D timeline — 21st.dev Interactive Timeline pattern, ControlOps modules. */
export function ModulesTimeline({ events, learnMore, className }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState(events[0]?.id ?? '');

  useEffect(() => {
    const rootEl = root.current;
    if (!rootEl) return;

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>('[data-timeline-card]');
      cards.forEach((card) => {
        ScrollTrigger.create({
          trigger: card,
          start: 'top 70%',
          end: 'bottom 40%',
          onEnter: () => setActiveId(card.dataset.moduleId || ''),
          onEnterBack: () => setActiveId(card.dataset.moduleId || ''),
        });
        gsap.fromTo(
          card,
          { opacity: 0, y: 48, rotateX: 8 },
          {
            opacity: 1,
            y: 0,
            rotateX: 0,
            duration: 0.75,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: card,
              start: 'top 85%',
              once: true,
            },
          }
        );
      });
    }, rootEl);

    return () => ctx.revert();
  }, [events]);

  return (
    <div ref={root} className={cn('relative', className)} style={{ perspective: 1200 }}>
      {/* Center spine */}
      <div
        aria-hidden
        className="absolute start-6 top-0 bottom-0 w-px md:start-1/2 md:-translate-x-1/2"
        style={{
          background:
            'linear-gradient(to bottom, transparent, rgba(224,78,0,0.45) 12%, rgba(224,78,0,0.45) 88%, transparent)',
        }}
      />

      <ol className="relative space-y-12 md:space-y-16">
        {events.map((event, i) => {
          const side = i % 2 === 0 ? 'left' : 'right';
          const Icon = ICONS[event.id] ?? Shield;
          const active = activeId === event.id;
          return (
            <li
              key={event.id}
              data-timeline-card
              data-module-id={event.id}
              className="relative grid grid-cols-[2.75rem_1fr] items-start gap-4 md:grid-cols-[1fr_2.75rem_1fr] md:gap-6"
            >
              {/* Mobile node */}
              <div className="flex justify-center pt-6 md:hidden">
                <TimelineNode active={active}>
                  <Icon className="size-4" />
                </TimelineNode>
              </div>

              {/* Left column (desktop) */}
              <div className={cn('hidden md:block', side === 'left' ? 'order-1' : 'order-1')}>
                {side === 'left' ? (
                  <div className="flex justify-end pe-2">
                    <TimelineCard event={event} side="left" learnMore={learnMore} active={active} />
                  </div>
                ) : (
                  <div className="h-full" />
                )}
              </div>

              {/* Desktop node */}
              <div className="relative z-10 hidden justify-center pt-8 md:flex md:order-2">
                <TimelineNode active={active}>
                  <Icon className="size-4" />
                </TimelineNode>
                <div
                  aria-hidden
                  className={cn(
                    'absolute top-[2.65rem] h-px w-8',
                    side === 'left' ? 'end-full' : 'start-full'
                  )}
                  style={{ backgroundColor: active ? '#E04E00' : 'var(--border)' }}
                />
              </div>

              {/* Right column (desktop) + mobile card */}
              <div className={cn('md:order-3', side === 'right' ? '' : 'md:block')}>
                <div className="md:hidden">
                  <TimelineCard event={event} side="right" learnMore={learnMore} active={active} />
                </div>
                <div className="hidden md:block">
                  {side === 'right' ? (
                    <div className="flex justify-start ps-2">
                      <TimelineCard event={event} side="right" learnMore={learnMore} active={active} />
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
