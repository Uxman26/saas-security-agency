'use client';

import { ModulesTimeline, type TimelineModule } from '@/components/ui/modules-timeline';
import { GsapReveal } from '@/components/marketing/gsap-reveal';

type Props = {
  eyebrow: string;
  title: string;
  intro: string;
  learnMore: string;
  modules: TimelineModule[];
};

export function ModulesTimelineSection({ eyebrow, title, intro, learnMore, modules }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-muted/20 py-16 md:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 50% 40% at 50% 0%, rgba(224,78,0,0.06), transparent 55%)',
        }}
      />
      <div className="container relative mx-auto px-4">
        <GsapReveal className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
          <p
            data-reveal
            className="mb-4 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: '#E04E00' }}
          >
            {eyebrow}
          </p>
          <h2 data-reveal className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {title}
          </h2>
          <p data-reveal className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {intro}
          </p>
        </GsapReveal>

        <ModulesTimeline events={modules} learnMore={learnMore} />
      </div>
    </section>
  );
}
