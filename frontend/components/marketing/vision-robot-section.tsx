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
    <section className="relative overflow-hidden border-b border-white/5 bg-[#0B0F14]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 55% 45% at 70% 60%, rgba(224,78,0,0.16), transparent 60%), radial-gradient(ellipse 40% 40% at 20% 20%, rgba(224,78,0,0.06), transparent 50%)',
        }}
      />

      <div className="container relative mx-auto grid min-h-[520px] items-center gap-8 px-4 py-16 md:min-h-[600px] md:grid-cols-2 md:gap-10 md:py-20 lg:min-h-[640px]">
        <GsapReveal className="relative z-10 order-2 md:order-1">
          <p
            data-reveal
            className="mb-4 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: '#E8590C' }}
          >
            {eyebrow}
          </p>
          <blockquote data-reveal className="max-w-xl">
            <p className="text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl lg:text-[2.75rem]">
              <span className="me-1" style={{ color: '#E8590C' }}>
                &ldquo;
              </span>
              {quote}
              <span className="ms-1" style={{ color: '#E8590C' }}>
                &rdquo;
              </span>
            </p>
            <footer className="mt-6 text-sm font-medium text-slate-400">{attribution}</footer>
          </blockquote>
        </GsapReveal>

        <div className="relative order-1 h-[320px] w-full md:order-2 md:h-[480px] lg:h-[540px]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[15%] bottom-[8%] h-16 rounded-full opacity-70 blur-2xl"
            style={{ background: 'radial-gradient(ellipse, rgba(224,78,0,0.45), transparent 70%)' }}
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
