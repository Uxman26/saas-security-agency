'use client';

import Link from 'next/link';
import { Shield, Sparkles, CalendarDays, type LucideIcon } from 'lucide-react';
import DisplayCards, { type DisplayCardProps } from '@/components/ui/display-cards';
import { BlurFade } from '@/components/ui/blur-fade';
import { RichInline } from '@/components/marketing/marketing-rich-text';
import { cn } from '@/lib/utils';

export type IndustryItem = {
  title: string;
  text: string;
  href: string;
  cta: string;
};

type Props = {
  title: string;
  intro: string;
  industries: IndustryItem[];
};

const ICONS: LucideIcon[] = [Shield, Sparkles, CalendarDays];

function plainText(html: string) {
  return html.replace(/<\/?hl>/g, '').replace(/\s+/g, ' ').trim();
}

const STACK_CLASSES = [
  "[grid-area:stack] hover:-translate-y-10 before:absolute before:left-0 before:top-0 before:h-[100%] before:w-[100%] before:rounded-xl before:bg-background/50 before:bg-blend-overlay before:outline before:outline-1 before:outline-border before:content-[''] before:transition-opacity before:duration-700 grayscale-[100%] hover:before:opacity-0 hover:grayscale-0",
  "[grid-area:stack] translate-x-8 translate-y-10 hover:-translate-y-1 before:absolute before:left-0 before:top-0 before:h-[100%] before:w-[100%] before:rounded-xl before:bg-background/50 before:bg-blend-overlay before:outline before:outline-1 before:outline-border before:content-[''] before:transition-opacity before:duration-700 grayscale-[100%] hover:before:opacity-0 hover:grayscale-0 sm:translate-x-12",
  '[grid-area:stack] translate-x-16 translate-y-20 hover:translate-y-10 sm:translate-x-24',
];

export function IndustriesBentoSection({ title, intro, industries }: Props) {
  const items = industries.slice(0, 3);

  const cards: DisplayCardProps[] = items.map((ind, i) => {
    const Icon = ICONS[i % ICONS.length];
    return {
      icon: <Icon className="size-4 text-orange-300" />,
      title: ind.title,
      description: plainText(ind.text),
      date: ind.cta,
      iconClassName: 'text-primary',
      titleClassName: 'text-primary',
      className: STACK_CLASSES[i],
    };
  });

  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-background py-16 md:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 45% 40% at 70% 55%, rgba(224,78,0,0.08), transparent 60%)',
        }}
      />

      <div className="container relative mx-auto px-4">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <BlurFade delay={0.05} inView className="lg:col-span-5">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              <RichInline text={title} variant="hero" />
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
              <RichInline text={intro} />
            </p>
            <ul className="mt-8 space-y-2">
              {items.map((ind) => (
                <li key={ind.href}>
                  <Link
                    href={ind.href}
                    className="group inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
                  >
                    <span className="size-1.5 rounded-full bg-primary opacity-70 transition-opacity group-hover:opacity-100" />
                    {ind.title}
                  </Link>
                </li>
              ))}
            </ul>
          </BlurFade>

          <BlurFade delay={0.18} inView className="lg:col-span-7">
            <div
              className={cn(
                'relative mx-auto flex min-h-[360px] w-full max-w-xl items-center justify-center sm:min-h-[420px]',
                'overflow-visible'
              )}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-10 bottom-8 top-16 rounded-[2rem] bg-primary/10 blur-3xl"
              />
              <DisplayCards cards={cards} className="relative z-10 -ms-4 sm:ms-0" />
            </div>
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
