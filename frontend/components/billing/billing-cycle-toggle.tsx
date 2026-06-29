'use client';

type Props = {
  value: 'monthly' | 'yearly';
  onChange: (v: 'monthly' | 'yearly') => void;
  yearlyDiscount?: number;
  monthlyLabel?: string;
  yearlyLabel?: string;
};

export function BillingCycleToggle({
  value,
  onChange,
  yearlyDiscount = 20,
  monthlyLabel = 'Monthly',
  yearlyLabel,
}: Props) {
  const yearly = yearlyLabel ?? `Yearly (${yearlyDiscount}% off)`;
  return (
    <div className="inline-flex rounded-full border bg-muted/40 p-1 gap-1">
      <button
        type="button"
        className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${value === 'monthly' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        onClick={() => onChange('monthly')}
      >
        {monthlyLabel}
      </button>
      <button
        type="button"
        className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${value === 'yearly' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        onClick={() => onChange('yearly')}
      >
        {yearly}
      </button>
    </div>
  );
}
