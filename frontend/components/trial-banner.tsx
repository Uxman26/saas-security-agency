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

  if (status.trial_active) {
    const ends = status.trial_ends_on
      ? new Date(status.trial_ends_on).toLocaleDateString()
      : null;
    const days = status.days_remaining ?? 0;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-sky-700 px-4 py-2 text-sm text-white">
        <span>
          Trial Active — {days} day{days === 1 ? '' : 's'} left
          {ends ? ` (ends ${ends})` : ''}
        </span>
        <Link
          href="/settings/billing"
          className="underline font-medium hover:text-white/90"
        >
          Upgrade
        </Link>
      </div>
    );
  }

  if (status.trial_expired || (status.subscription_required && status.subscription_status !== 'pending' && !status.can_use_paid_features)) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-700 px-4 py-2 text-sm text-white">
        <span>
          Trial expired — Subscription required. You can still view your data and upgrade.
        </span>
        <Link
          href="/settings/billing"
          className="underline font-medium hover:text-white/90"
        >
          Go to Billing
        </Link>
      </div>
    );
  }

  return null;
}
