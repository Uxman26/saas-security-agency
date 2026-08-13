'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { setLocale } from '@/actions/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ar', label: 'Arabic', flag: '🇸🇦' },
] as const;

type Props = {
  className?: string;
  /** Kept for existing call sites (auth / marketing). */
  variant?: 'default' | 'auth' | 'dark';
};

/**
 * Pill language selector — English & Arabic only.
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
          // Flag-only pill on phones — the label is the widest thing in the header and
          // the flag already identifies the language. Full label returns at `sm`.
          'h-9 w-auto shrink-0 gap-1.5 rounded-full border-border/80 bg-muted/70 px-2.5 text-sm font-medium shadow-sm',
          'sm:min-w-[8.25rem] sm:gap-2 sm:px-3.5',
          'hover:bg-muted dark:border-white/12 dark:bg-[#1a1f28] dark:hover:bg-[#222833]',
          'data-[size=sm]:h-9 [&_svg]:opacity-60',
          className
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-base leading-none" aria-hidden>
            {current.flag}
          </span>
          <span className="sr-only sm:not-sr-only sm:truncate">{current.label}</span>
        </span>
      </SelectTrigger>

      <SelectContent
        align="end"
        className="min-w-[12rem] rounded-2xl border-border/80 p-1.5 shadow-lg dark:border-white/10 dark:bg-[#12161d]"
      >
        {LANGUAGES.map((lang) => {
          const selected = lang.code === current.code;
          return (
            <SelectItem
              key={lang.code}
              value={lang.code}
              className={cn(
                'cursor-pointer rounded-xl py-2.5 ps-3 text-sm font-medium',
                'focus:bg-muted dark:focus:bg-white/8',
                selected &&
                  'text-sky-500 focus:text-sky-500 data-[highlighted]:text-sky-500 [&_svg]:!text-sky-500'
              )}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-base leading-none" aria-hidden>
                  {lang.flag}
                </span>
                <span>{lang.label}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
