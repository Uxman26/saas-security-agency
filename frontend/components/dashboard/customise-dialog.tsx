'use client';

import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Layout, WidgetId } from '@/lib/dashboard/layout';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  layout: Layout;
  available: Set<WidgetId>;
  onChange: (l: Layout) => void;
  onReset: () => void;
};

export function CustomiseDialog({ open, onOpenChange, layout, available, onChange, onReset }: Props) {
  const t = useTranslations('dashboard');
  const order = layout.order.filter((id) => available.has(id));

  const move = (id: WidgetId, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    const rest = layout.order.filter((x) => !available.has(x));
    onChange({ ...layout, order: [...next, ...rest] });
  };

  const toggle = (id: WidgetId) =>
    onChange({
      ...layout,
      hidden: layout.hidden.includes(id) ? layout.hidden.filter((x) => x !== id) : [...layout.hidden, id],
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('customise.title')}</DialogTitle>
          <DialogDescription>{t('customise.description')}</DialogDescription>
        </DialogHeader>
        <ol className="-mx-1 max-h-[60vh] space-y-1 overflow-y-auto px-1">
          {order.map((id, i) => {
            const hidden = layout.hidden.includes(id);
            const name = t(`widgets.${id}`);
            return (
              <li key={id} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 ring-1 ring-hairline', hidden && 'opacity-60')}>
                <span className="w-5 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="flex-1 text-sm font-medium">{name}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t('customise.up', { name })} disabled={!i} onClick={() => move(id, -1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t('customise.down', { name })} disabled={i === order.length - 1} onClick={() => move(id, 1)}>
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-pressed={!hidden}
                  aria-label={t(hidden ? 'customise.show' : 'customise.hide', { name })}
                  onClick={() => toggle(id)}
                >
                  {hidden ? <EyeOff /> : <Eye />}
                </Button>
              </li>
            );
          })}
        </ol>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" onClick={onReset}>
            <RotateCcw />
            {t('customise.reset')}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('customise.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
