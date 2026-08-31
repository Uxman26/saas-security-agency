'use client';

import { InteractiveRobotSpline } from '@/components/marketing/interactive-3d-robot';
import { BlurFade } from '@/components/ui/blur-fade';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import { TextAnimate } from '@/components/ui/text-animate';
import { Ripple } from '@/components/ui/ripple';

const ROBOT_SCENE_URL = 'https://prod.spline.design/PyzDhpQ9E5f1E3MT/scene.splinecode';

type Props = {
  eyebrow: string;
  quote: string;
  attribution: string;
};

export function VisionRobotSection({ eyebrow, quote, attribution }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 50% 45% at 78% 55%, rgba(224,78,0,0.07), transparent 60%)',
        }}
      />

      <div className="container relative mx-auto px-4 py-16 md:py-20">
        <div className="grid min-h-[480px] items-center gap-10 md:min-h-[560px] md:grid-cols-12 md:gap-6 lg:gap-10">
          <div className="relative z-20 order-2 max-w-xl md:order-1 md:col-span-5 md:max-w-none lg:col-span-5">
            <BlurFade delay={0.05} inView>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em]">
                <AnimatedGradientText
                  colorFrom="#F45100"
                  colorTo="#F97316"
                  speed={1.2}
                  className="font-semibold uppercase tracking-[0.2em]"
                >
                  {eyebrow}
                </AnimatedGradientText>
              </p>
            </BlurFade>
            <blockquote className="w-full max-w-[22rem] sm:max-w-sm md:max-w-[20rem] lg:max-w-md xl:max-w-lg">
              <BlurFade delay={0.12} inView>
                <p className="text-pretty text-3xl font-bold leading-snug tracking-tight text-foreground md:text-[1.85rem] lg:text-[2.15rem] xl:text-[2.35rem]">
                  <span className="me-1" style={{ color: '#F45100' }}>
                    &ldquo;
                  </span>
                  <TextAnimate
                    as="span"
                    by="word"
                    animation="fadeIn"
                    startOnView
                    once
                    className="inline"
                    segmentClassName="inline"
                  >
                    {quote}
                  </TextAnimate>
                  <span className="ms-1" style={{ color: '#F45100' }}>
                    &rdquo;
                  </span>
                </p>
              </BlurFade>
              <BlurFade delay={0.35} inView>
                <footer className="mt-6 text-sm font-medium text-muted-foreground">
                  {attribution}
                </footer>
              </BlurFade>
            </blockquote>
          </div>

          <BlurFade
            delay={0.2}
            direction="right"
            offset={28}
            inView
            className="relative order-1 h-[300px] w-full overflow-hidden bg-transparent md:order-2 md:col-span-7 md:h-[440px] md:ps-10 lg:h-[520px] lg:ps-14"
          >
            <Ripple
              className="opacity-25"
              mainCircleSize={140}
              mainCircleOpacity={0.18}
              numCircles={5}
            />
            <InteractiveRobotSpline
              scene={ROBOT_SCENE_URL}
              className="absolute inset-0 h-full w-full translate-x-[12%] bg-transparent sm:translate-x-[14%] md:translate-x-[18%] lg:translate-x-[22%]"
            />
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
