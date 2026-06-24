'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { setLocale } from '@/actions/locale';
import { cn } from '@/lib/utils';

type Props = { className?: string; variant?: 'default' | 'auth' };

export function LanguageSwitcher({ className, variant = 'default' }: Props) {
  const locale = useLocale();
  const router = useRouter();

  const pick = async (next: string) => {
    if (next === locale) return;
    await setLocale(next);
    router.refresh();
  };

  const btn = (code: string, label: string) => (
    <button
      type="button"
      onClick={() => void pick(code)}
      className={cn(
        'px-2 py-1 rounded text-xs font-medium transition-colors',
        locale === code
          ? variant === 'auth'
            ? 'bg-[#FD6203] text-white'
            : 'bg-primary text-primary-foreground'
          : variant === 'auth'
            ? 'text-[#4B5563] hover:text-[#161E2C]'
            : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  );

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {btn('en', 'EN')}
      {btn('ar', 'عربي')}
    </div>
  );
}
