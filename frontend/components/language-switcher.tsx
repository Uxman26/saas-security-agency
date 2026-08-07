'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown } from 'lucide-react';
import { setLocale } from '@/actions/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ar', label: 'Arabic', flag: '🇸🇦' },
] as const;

type Props = {
  className?: string;
  /** @deprecated Kept for call-site compatibility — styling is unified. */
  variant?: 'default' | 'auth' | 'dark';
};

/**
 * Pill language selector — English & Arabic only (design-matched dropdown).
 */
export function LanguageSwitcher({ className }: Props) {
  const locale = useLocale();
  const router = useRouter();
  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];

  const onChange = async (next: string) => {
    if (next === locale) return;
    await setLocale(next);
    router.refresh();
  };

  return (
    <Select value={current.code} onValueChange={(v) => void onChange(v)}>
      <SelectTrigger
        size="sm"
        aria-label="Language"
        className={cn(
          'h-9 w-auto min-w-[7.5rem] shrink-0 gap-2 rounded-full border-border/80 bg-muted/70 px-3.5 text-sm font-medium shadow-sm',
          'hover:bg-muted dark:border-white/12 dark:bg-[#1a1f28] dark:hover:bg-[#222833]',
          '[&_svg]:opacity-70 data-[size=sm]:h-9',
          className
        )}
      >
        <SelectValue>
          <span className="flex items-center gap-2">
            <span className="text-base leading-none" aria-hidden>
              {current.flag}
            </span>
            <span>{current.label}</span>
          </span>
        </SelectValue>
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </SelectTrigger>

      <SelectContent
        align="end"
        className="min-w-[11rem] rounded-2xl border-border/80 p-1.5 shadow-lg dark:border-white/10 dark:bg-[#12161d]"
      >
        {LANGUAGES.map((lang) => {
          const selected = lang.code === current.code;
          return (
            <SelectItem
              key={lang.code}
              value={lang.code}
              className={cn(
                'cursor-pointer rounded-xl py-2.5 pe-8 ps-3 text-sm font-medium',
                'focus:bg-muted dark:focus:bg-white/8',
                selected && 'text-sky-500 focus:text-sky-500 data-[highlighted]:text-sky-500'
              )}
              /* Hide default check — we render our own aligned to the design */
              indicatorClassName="hidden"
            >
              <span className="flex w-full items-center justify-between gap-6">
                <span className="flex items-center gap-2.5">
                  <span className="text-base leading-none" aria-hidden>
                    {lang.flag}
                  </span>
                  <span>{lang.label}</span>
                </span>
                {selected ? <Check className="size-4 shrink-0 text-sky-500" strokeWidth={2.5} /> : null}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
