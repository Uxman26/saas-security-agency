'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Building2, Loader2, MapPin, Phone } from 'lucide-react';
import { Auth3DShell } from '@/components/auth/auth-3d-shell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { WORKFORCE_VALUES } from '@/lib/industry-options';
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

/* Mirrors the API's checks so the popup says what is wrong before submitting. */
const PHONE_RE = /^\+?[0-9 ()-]+$/;
const POSTCODE_RE = /^[A-Z0-9][A-Z0-9 -]{1,8}[A-Z0-9]$/;
const validPhone = (v: string) => {
  const digits = v.replace(/\D/g, '').length;
  return PHONE_RE.test(v.trim()) && digits >= 7 && digits <= 15;
};
const normPostcode = (v: string) => v.trim().toUpperCase().split(/\s+/).join(' ');

type Field = 'company' | 'plan' | 'phone' | 'workforce' | 'postcode';

function CompleteOAuthSignup() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const tp = useTranslations('marketing.plans');
  const tb = useTranslations('marketing.bookDemo');
  const workforceLabels = tb.raw('workforce') as string[];
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
  const [phone, setPhone] = useState('');
  const [workforce, setWorkforce] = useState('');
  const [postcode, setPostcode] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
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
    const next: Partial<Record<Field, string>> = {};
    if (companyName.trim().length < 2) next.company = t('oauthCompleteCompanyRequired');
    if (!tier) next.plan = t('oauthCompletePlanRequired');
    if (!validPhone(phone)) next.phone = t('oauthCompletePhoneRequired');
    if (!workforce) next.workforce = t('oauthCompleteWorkforceRequired');
    if (!POSTCODE_RE.test(normPostcode(postcode))) next.postcode = t('oauthCompletePostcodeRequired');
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      const res = await api.auth.completeOAuthSignup({
        signup_token: token,
        company_name: companyName.trim(),
        subscription_tier: tier,
        start_trial: startTrial,
        billing_cycle,
        phone: phone.trim(),
        workforce_size: workforce,
        postcode: normPostcode(postcode),
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

  const err = (f: Field) => (errors[f] ? <p className={authDarkErrorClass}>{errors[f]}</p> : null);

  return (
    <Auth3DShell
      compact
      title={t('oauthCompleteTitle')}
      subtitle={t('oauthCompleteSubtitle', { email })}
      topLink={{ href: '/login', label: tc('signIn') }}
    >
      <div className="flex justify-center py-6">
        <Loader2 className="size-6 animate-spin text-white/40" aria-hidden />
      </div>
      {/* The account is only created once these are filled in, so the popup cannot be
          dismissed by clicking outside or pressing Esc — only by Cancel, which leaves. */}
      <Dialog open>
        <DialogContent
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="dark max-h-[92svh] overflow-y-auto border-white/10 bg-[#11161D] text-white sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-white">{t('oauthCompleteDialogTitle')}</DialogTitle>
            <DialogDescription className="text-white/60">
              {t('oauthCompleteDialogDesc', { email })}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} noValidate className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="company_name" className={authDarkLabelClass}>
                {t('companyName')} *
              </Label>
              <div className="relative">
                <Building2 className={authDarkIconClass} />
                <Input
                  id="company_name"
                  placeholder="Acme Services Ltd"
                  maxLength={TEXT_LIMITS.companyName}
                  autoComplete="organization"
                  aria-invalid={!!errors.company}
                  className={cn(authDarkFieldClass, 'h-11 ps-10')}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              {err('company')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className={authDarkLabelClass}>
                {t('oauthCompletePhone')} *
              </Label>
              <div className="relative">
                <Phone className={authDarkIconClass} />
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="07700 900123"
                  maxLength={20}
                  aria-invalid={!!errors.phone}
                  className={cn(authDarkFieldClass, 'h-11 ps-10')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              {err('phone')}
            </div>
            <div className="space-y-1.5">
              <Label className={authDarkLabelClass}>{t('oauthCompleteWorkforce')} *</Label>
              <Select value={workforce} onValueChange={setWorkforce}>
                <SelectTrigger className={cn(authDarkSelectClass, 'h-11')} aria-invalid={!!errors.workforce}>
                  <SelectValue placeholder={t('oauthCompleteWorkforceSelect')} />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#11161D] text-white">
                  {WORKFORCE_VALUES.map((v, i) => (
                    <SelectItem key={v} value={v} className="focus:bg-white/10 focus:text-white">
                      {workforceLabels[i] ?? v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err('workforce')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="postcode" className={authDarkLabelClass}>
                {t('oauthCompletePostcode')} *
              </Label>
              <div className="relative">
                <MapPin className={authDarkIconClass} />
                <Input
                  id="postcode"
                  autoComplete="postal-code"
                  placeholder="SW1A 1AA"
                  maxLength={10}
                  aria-invalid={!!errors.postcode}
                  className={cn(authDarkFieldClass, 'h-11 ps-10 uppercase')}
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                />
              </div>
              {err('postcode')}
            </div>
            {!tierParam && (
              <div className="space-y-1.5">
                <Label className={authDarkLabelClass}>{t('oauthCompletePlan')} *</Label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger className={cn(authDarkSelectClass, 'h-11')} aria-invalid={!!errors.plan}>
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
                {err('plan')}
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                className="h-11 text-white/70 hover:bg-white/10 hover:text-white sm:flex-1"
                onClick={() => router.replace('/login')}
                disabled={loading}
              >
                {t('oauthCompleteCancel')}
              </Button>
              <Button type="submit" className={cn(authDarkBtnClass, 'sm:flex-[2]')} disabled={loading}>
                {loading ? t('creatingAccount') : t('createAccount')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
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
