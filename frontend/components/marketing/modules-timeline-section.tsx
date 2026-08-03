'use client';

import { ModulesTimeline, type TimelineModule } from '@/components/ui/modules-timeline';
import { BlurFade } from '@/components/ui/blur-fade';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import { TextAnimate } from '@/components/ui/text-animate';

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
        <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
          <BlurFade delay={0.05} inView>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em]">
              <AnimatedGradientText
                colorFrom="#E04E00"
                colorTo="#F97316"
                speed={1.2}
                className="font-semibold uppercase tracking-[0.2em]"
              >
                {eyebrow}
              </AnimatedGradientText>
            </p>
          </BlurFade>
          <BlurFade delay={0.12} inView>
            <TextAnimate
              as="h2"
              by="word"
              animation="blurInUp"
              startOnView
              once
              className="text-3xl font-bold tracking-tight text-foreground md:text-4xl"
            >
              {title}
            </TextAnimate>
          </BlurFade>
          <BlurFade delay={0.22} inView>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">{intro}</p>
          </BlurFade>
        </div>

        <BlurFade delay={0.28} inView>
          <ModulesTimeline events={modules} learnMore={learnMore} />
        </BlurFade>
      </div>
    </section>
  );
}
