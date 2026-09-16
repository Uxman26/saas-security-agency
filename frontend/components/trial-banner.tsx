'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import type { TrialStatus } from '@/lib/types';

export function TrialBanner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<TrialStatus | null>(null);

  useEffect(() => {
    if (!user || user.role === 'super_admin' || !user.company_id) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    api.subscriptions
      .trialStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!status) return null;

  const plan = status.plan_tier ? status.plan_tier.replace(/_/g, ' ') : null;
  const cycle = status.billing_cycle;
  const start = status.trial_starts_on ? new Date(status.trial_starts_on).toLocaleDateString() : null;
  const ends = status.trial_ends_on ? new Date(status.trial_ends_on).toLocaleDateString() : null;

  if (status.trial_active) {
    const days = status.days_remaining ?? 0;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-sky-700 px-4 py-2 text-sm text-white">
        <span>
          {status.label || 'Trial Active'}
          {plan ? ` · ${plan}` : ''}
          {cycle ? ` (${cycle})` : ''}
          {' — '}
          {days} day{days === 1 ? '' : 's'} left
          {start ? ` · started ${start}` : ''}
          {ends ? ` · ends ${ends}` : ''}
        </span>
        <Link href="/settings/billing" className="underline font-medium hover:text-white/90">
          Upgrade
        </Link>
      </div>
    );
  }

  if (status.trial_expired || (status.subscription_required && status.subscription_status !== 'pending' && !status.can_use_paid_features)) {
    return (
      <div className="space-y-0">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-700 px-4 py-2 text-sm text-white">
          <span>
            {status.label || 'Trial expired'}
            {plan ? ` · ${plan}` : ''}
            {ends ? ` · ended ${ends}` : ''}
            {' — '}
            {status.restriction ||
              'You can still sign in, view, and edit existing data. Adding new records and paid features are locked until the subscription is activated.'}
          </span>
          <Link href="/settings/billing" className="underline font-medium hover:text-white/90">
            Go to Billing
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
