'use client';

import { InteractiveRobotSpline } from '@/components/marketing/interactive-3d-robot';
import { BlurFade } from '@/components/ui/blur-fade';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import { TextAnimate } from '@/components/ui/text-animate';
import { Ripple } from '@/components/ui/ripple';
import { BorderBeam } from '@/components/ui/border-beam';

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
        <div className="relative z-10 order-2 md:order-1">
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
          <blockquote className="max-w-xl">
            <BlurFade delay={0.12} inView>
              <p className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl lg:text-[2.6rem]">
                <span className="me-1" style={{ color: '#E04E00' }}>
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
                <span className="ms-1" style={{ color: '#E04E00' }}>
                  &rdquo;
                </span>
              </p>
            </BlurFade>
            <BlurFade delay={0.35} inView>
              <footer className="mt-6 text-sm font-medium text-muted-foreground">{attribution}</footer>
            </BlurFade>
          </blockquote>
        </div>

        <BlurFade
          delay={0.2}
          direction="right"
          offset={28}
          inView
          className="relative order-1 h-[300px] w-full overflow-hidden rounded-2xl bg-transparent md:order-2 md:h-[440px] lg:h-[500px]"
        >
          <Ripple
            className="opacity-30"
            mainCircleSize={140}
            mainCircleOpacity={0.2}
            numCircles={5}
          />
          <InteractiveRobotSpline
            scene={ROBOT_SCENE_URL}
            className="absolute inset-0 h-full w-full bg-transparent"
          />
          <BorderBeam size={100} duration={9} colorFrom="#E04E00" colorTo="#FDBA74" />
        </BlurFade>
      </div>
    </section>
  );
}
