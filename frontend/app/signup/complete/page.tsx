'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Building2, Loader2 } from 'lucide-react';
import { Auth3DShell } from '@/components/auth/auth-3d-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { analytics } from '@/lib/analytics';
import { api } from '@/lib/api';
import {
  authDarkBtnClass,
  authDarkErrorClass,
  authDarkFieldClass,
  authDarkIconClass,
  authDarkLabelClass,
  authDarkSelectClass,
} from '@/lib/auth-styles';
import { DEFAULT_PLAN_TIERS, planDisplay } from '@/lib/plan-tiers';
import { TEXT_LIMITS } from '@/lib/text-limits';
import { toast } from '@/lib/toast';
import type { PlanTier } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Reads the email from the signup token for display only; the API verifies the token. */
function emailFromToken(token: string): string {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return String(JSON.parse(atob(payload)).email || '');
  } catch {
    return '';
  }
}

function CompleteOAuthSignup() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const tp = useTranslations('marketing.plans');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const tierParam = searchParams.get('tier') || '';
  const billing_cycle = searchParams.get('cycle') === 'yearly' ? 'yearly' : 'monthly';
  // Without a plan from the pricing page the backend decides whether the chosen plan has a trial.
  const startTrial = tierParam ? searchParams.get('trial') === '1' : true;
  const email = useMemo(() => emailFromToken(token), [token]);

  const [companyName, setCompanyName] = useState('');
  const [tier, setTier] = useState(tierParam);
  const [tiers, setTiers] = useState<PlanTier[]>([]);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) router.replace('/login');
  }, [token, router]);

  useEffect(() => {
    if (tierParam) return;
    api.packages
      .list()
      .then(setTiers)
      .catch(() => setTiers(DEFAULT_PLAN_TIERS));
  }, [tierParam]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (companyName.trim().length < 2) {
      setFormError(t('oauthCompleteCompanyRequired'));
      return;
    }
    if (!tier) {
      setFormError(t('oauthCompletePlanRequired'));
      return;
    }
    setFormError('');
    setLoading(true);
    try {
      const res = await api.auth.completeOAuthSignup({
        signup_token: token,
        company_name: companyName.trim(),
        subscription_tier: tier,
        start_trial: startTrial,
        billing_cycle,
      });
      const trialDays = res.trial?.started ? res.trial.days ?? 0 : 0;
      analytics.signUp({ tier, trial: Boolean(trialDays) });
      if (trialDays) analytics.trialStarted(tier, trialDays);
      if (res.company_login_id) {
        toast.success(t('oauthCompanyIdNotice', { id: res.company_login_id }));
      }
      toast.success(trialDays ? t('accountCreatedTrial', { days: trialDays }) : t('accountCreatedPayment'));
      router.push(
        `/payment-pending?ref=${encodeURIComponent(res.receipt.ref_id)}&cycle=${billing_cycle}&checkout=1`
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('signupFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (!token) return null;

  return (
    <Auth3DShell
      compact
      title={t('oauthCompleteTitle')}
      subtitle={t('oauthCompleteSubtitle', { email })}
      topLink={{ href: '/login', label: tc('signIn') }}
    >
      <form onSubmit={onSubmit} className="space-y-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="company_name" className={authDarkLabelClass}>
            {t('companyName')}
          </Label>
          <div className="relative">
            <Building2 className={authDarkIconClass} />
            <Input
              id="company_name"
              placeholder="Acme Services Ltd"
              maxLength={TEXT_LIMITS.companyName}
              className={cn(authDarkFieldClass, 'h-11 ps-10')}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
        </div>
        {!tierParam && (
          <div className="space-y-1.5">
            <Label className={authDarkLabelClass}>{t('oauthCompletePlan')}</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className={cn(authDarkSelectClass, 'h-11')}>
                <SelectValue placeholder={t('oauthCompleteSelectPlan')} />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#11161D] text-white">
                {tiers.map((plan) => (
                  <SelectItem key={plan.tier} value={plan.tier} className="focus:bg-white/10 focus:text-white">
                    {planDisplay(plan, tp).name} · £{plan.price_gbp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {formError && <p className={authDarkErrorClass}>{formError}</p>}
        <Button type="submit" className={authDarkBtnClass} disabled={loading}>
          {loading ? t('creatingAccount') : t('createAccount')}
        </Button>
      </form>
    </Auth3DShell>
  );
}

export default function CompleteOAuthSignupPage() {
  return (
    <Suspense
      fallback={
        <div className="dark flex min-h-svh items-center justify-center bg-[#05070a]">
          <Loader2 className="size-8 animate-spin text-[#FF6A1F]" />
        </div>
      }
    >
      <CompleteOAuthSignup />
    </Suspense>
  );
}
