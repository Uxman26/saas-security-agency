'use client';

import { InteractiveRobotSpline } from '@/components/marketing/interactive-3d-robot';
import { GsapReveal } from '@/components/marketing/gsap-reveal';

const ROBOT_SCENE_URL = 'https://prod.spline.design/PyzDhpQ9E5f1E3MT/scene.splinecode';

type Props = {
  eyebrow: string;
  quote: string;
  attribution: string;
};

export function VisionRobotSection({ eyebrow, quote, attribution }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-muted/30">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 55% 45% at 70% 60%, rgba(224,78,0,0.07), transparent 60%)',
        }}
      />

      <div className="container relative mx-auto grid min-h-[480px] items-center gap-8 px-4 py-16 md:min-h-[560px] md:grid-cols-2 md:gap-10 md:py-20">
        <GsapReveal className="relative z-10 order-2 md:order-1">
          <p
            data-reveal
            className="mb-4 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: '#E04E00' }}
          >
            {eyebrow}
          </p>
          <blockquote data-reveal className="max-w-xl">
            <p className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl lg:text-[2.6rem]">
              <span className="me-1" style={{ color: '#E04E00' }}>
                &ldquo;
              </span>
              {quote}
              <span className="ms-1" style={{ color: '#E04E00' }}>
                &rdquo;
              </span>
            </p>
            <footer className="mt-6 text-sm font-medium text-muted-foreground">{attribution}</footer>
          </blockquote>
        </GsapReveal>

        <div className="relative order-1 h-[300px] w-full md:order-2 md:h-[440px] lg:h-[500px]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[15%] bottom-[8%] h-16 rounded-full opacity-50 blur-2xl"
            style={{ background: 'radial-gradient(ellipse, rgba(224,78,0,0.35), transparent 70%)' }}
          />
          <InteractiveRobotSpline
            scene={ROBOT_SCENE_URL}
            className="absolute inset-0 h-full w-full"
          />
        </div>
      </div>
    </section>
  );
}
