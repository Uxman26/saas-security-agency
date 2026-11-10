'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateUK, localDateKey } from '@/lib/date-format';
import { paymentTermDate } from '@/lib/invoice-utils';

const PRESET_DAYS = [7, 15, 30, 45];

/** Quick payment terms counted from the invoice date, plus a manual date. */
export function DueDateField({
  invoiceDate,
  value,
  onChange,
}: {
  /** Blank means the invoice will be dated today. */
  invoiceDate: string;
  value: string;
  onChange: (date: string) => void;
}) {
  const [customMode, setCustomMode] = useState(false);
  const base = invoiceDate || localDateKey();
  const presetDays = PRESET_DAYS.find((days) => paymentTermDate(base, days) === value.slice(0, 10));
  const showCustom = customMode || (!!value && presetDays === undefined);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESET_DAYS.map((days) => {
          const active = !showCustom && presetDays === days;
          return (
            <Button
              key={days}
              type="button"
              size="sm"
              variant={active ? 'default' : 'outline'}
              aria-pressed={active}
              onClick={() => {
                setCustomMode(false);
                onChange(paymentTermDate(base, days));
              }}
            >
              {days} Days
            </Button>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant={showCustom ? 'default' : 'outline'}
          aria-pressed={showCustom}
          onClick={() => setCustomMode(true)}
        >
          Custom
        </Button>
      </div>
      {showCustom ? (
        <Input
          type="date"
          aria-label="Custom due date"
          value={value.slice(0, 10)}
          min={base}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : value ? (
        <p className="text-xs text-muted-foreground">Due {formatDateUK(value)}</p>
      ) : null}
    </div>
  );
}
