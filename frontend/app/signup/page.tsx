'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Auth3DShell } from '@/components/auth/auth-3d-shell';
import { signupSchema } from '@/lib/validation';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';
import { Building2, Eye, EyeOff, Lock, Mail, User, Loader2 } from 'lucide-react';
import { parseEmailVerificationRequired } from '@/lib/sidebar-modules';
import {
  authDarkBtnClass,
  authDarkErrorClass,
  authDarkFieldClass,
  authDarkIconClass,
  authDarkLabelClass,
  authDarkLinkClass,
  authDarkSelectClass,
} from '@/lib/auth-styles';
import { INDUSTRY_VALUES, WORKFORCE_VALUES } from '@/lib/industry-options';
import { cn } from '@/lib/utils';

const INDUSTRIES = INDUSTRY_VALUES;
const WORKFORCE = WORKFORCE_VALUES;

function SignupForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const tb = useTranslations('marketing.bookDemo');
  const router = useRouter();
  const searchParams = useSearchParams();
  const tierParam = searchParams.get('tier');
  const cycleParam = searchParams.get('cycle');
  const subscription_tier = tierParam || undefined;
  const billing_cycle = cycleParam === 'yearly' ? 'yearly' : 'monthly';
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');

  const industryLabels = tb.raw('industries') as string[];
  const workforceLabels = tb.raw('workforce') as string[];

  useEffect(() => {
    if (!tierParam) router.replace('/pricing');
  }, [tierParam, router]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: {
    email: string;
    password: string;
    full_name: string;
    company_name: string;
    industry: string;
    workforce_size: string;
    verification_code?: string;
  }) => {
    setLoading(true);
    try {
      const res = await api.auth.signup({ ...data, subscription_tier });
      const ref = encodeURIComponent(res.receipt.ref_id);
      const email = encodeURIComponent(data.email);
      const cycleQ = `&cycle=${billing_cycle}`;
      const code = (data.verification_code || verificationCode).trim();
      const couponQ = code ? `&coupon=${encodeURIComponent(code)}` : '';
      if (res.email_verification_required) {
        toast.success(t('accountCreatedVerify'));
        router.push(`/verify-email?email=${email}&ref=${ref}${cycleQ}${couponQ}`);
      } else {
        toast.success(t('accountCreatedPayment'));
        router.push(`/payment-pending?ref=${ref}&cycle=${billing_cycle}${couponQ}`);
      }
    } catch (err: unknown) {
      const verify = parseEmailVerificationRequired(err);
      if (verify?.email) {
        const q = new URLSearchParams({ email: verify.email });
        if (verify.receipt_ref) q.set('ref', verify.receipt_ref);
        q.set('cycle', billing_cycle);
        const code = verificationCode.trim();
        if (code) q.set('coupon', code);
        toast.info(t('accountCreatedVerify'));
        router.push(`/verify-email?${q.toString()}`);
        return;
      }
      toast.error(err instanceof Error ? err.message : t('signupFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (!subscription_tier) {
    return (
      <div className="dark flex min-h-svh flex-col items-center justify-center gap-4 bg-[#05070a] px-4 text-white">
        <Loader2 className="size-8 animate-spin text-[#FF6A1F]" />
        <p className="text-white/70">{t('signupLoadingPlan')}</p>
        <p className="text-sm text-white/45">
          <Link href="/pricing" className={authDarkLinkClass}>
            {tc('viewPlans')}
          </Link>
          {' · '}
          <Link href="/login" className={authDarkLinkClass}>
            {tc('signIn')}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <Auth3DShell
      compact
      title={t('signupTitle')}
      subtitle={subscription_tier ? t('signupSubtitlePlan', { tier: subscription_tier }) : t('signupSubtitle')}
      topLink={{ href: '/login', label: tc('signIn') }}
      footer={
        <>
          {tc('alreadyHaveAccount')}{' '}
          <Link href="/login" className={authDarkLinkClass}>
            {tc('signIn')}
          </Link>
          {' · '}
          <Link href="/pricing" className={authDarkLinkClass}>
            {tc('viewPlans')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="full_name" className={authDarkLabelClass}>
            {t('fullName')}
          </Label>
          <div className="relative">
            <User className={authDarkIconClass} />
            <Input
              id="full_name"
              placeholder="John Smith"
              className={cn(authDarkFieldClass, 'h-11 ps-10')}
              {...register('full_name')}
            />
          </div>
          {errors.full_name && <p className={authDarkErrorClass}>{errors.full_name.message as string}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className={authDarkLabelClass}>
            {t('email')}
          </Label>
          <div className="relative">
            <Mail className={authDarkIconClass} />
            <Input
              id="email"
              type="email"
              placeholder="name@company.com"
              className={cn(authDarkFieldClass, 'h-11 ps-10')}
              {...register('email')}
            />
          </div>
          {errors.email && <p className={authDarkErrorClass}>{errors.email.message as string}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className={authDarkLabelClass}>
            {t('password')}
          </Label>
          <div className="relative">
            <Lock className={authDarkIconClass} />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a password"
              className={cn(authDarkFieldClass, 'h-11 ps-10 pe-10')}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && <p className={authDarkErrorClass}>{errors.password.message as string}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company_name" className={authDarkLabelClass}>
            {t('companyName')}
          </Label>
          <div className="relative">
            <Building2 className={authDarkIconClass} />
            <Input
              id="company_name"
              placeholder="Acme Services Ltd"
              className={cn(authDarkFieldClass, 'h-11 ps-10')}
              {...register('company_name')}
            />
          </div>
          {errors.company_name && (
            <p className={authDarkErrorClass}>{errors.company_name.message as string}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className={authDarkLabelClass}>{t('industry')}</Label>
          <Select onValueChange={(v) => setValue('industry', v, { shouldValidate: true })}>
            <SelectTrigger className={cn(authDarkSelectClass, 'h-11')}>
              <SelectValue placeholder={t('selectIndustry')} />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#11161D] text-white">
              {INDUSTRIES.map((v, i) => (
                <SelectItem key={v} value={v} className="focus:bg-white/10 focus:text-white">
                  {industryLabels[i] ?? v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.industry && <p className={authDarkErrorClass}>{errors.industry.message as string}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className={authDarkLabelClass}>{t('workforceSize')}</Label>
          <Select onValueChange={(v) => setValue('workforce_size', v, { shouldValidate: true })}>
            <SelectTrigger className={cn(authDarkSelectClass, 'h-11')}>
              <SelectValue placeholder={t('selectSize')} />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#11161D] text-white">
              {WORKFORCE.map((v, i) => (
                <SelectItem key={v} value={v} className="focus:bg-white/10 focus:text-white">
                  {workforceLabels[i] ?? v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.workforce_size && (
            <p className={authDarkErrorClass}>{errors.workforce_size.message as string}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="verification_code" className={authDarkLabelClass}>
            Verification / promo code (optional)
          </Label>
          <Input
            id="verification_code"
            placeholder="Enter code if you have one"
            className={cn(authDarkFieldClass, 'h-11')}
            value={verificationCode}
            onChange={(e) => {
              setVerificationCode(e.target.value);
              setValue('verification_code', e.target.value);
            }}
          />
        </div>
        <p className="text-xs leading-relaxed text-white/45">
          {t('signupPrivacyPrefix')}{' '}
          <Link href="/terms" className={authDarkLinkClass}>
            {t('signupPrivacyTerms')}
          </Link>{' '}
          {t('signupPrivacyAnd')}{' '}
          <Link href="/privacy" className={authDarkLinkClass}>
            {t('signupPrivacyPolicy')}
          </Link>
          .
        </p>
        <Button type="submit" className={authDarkBtnClass} disabled={loading}>
          {loading ? t('creatingAccount') : t('createAccount')}
        </Button>
      </form>
    </Auth3DShell>
  );
}

function SignupFallback() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  return (
    <div className="dark flex min-h-svh flex-col items-center justify-center gap-4 bg-[#05070a] px-4 text-white">
      <Loader2 className="size-8 animate-spin text-[#FF6A1F]" />
      <p className="text-white/70">{t('signupPreparing')}</p>
      <p className="text-sm text-white/45">
        <Link href="/pricing" className={authDarkLinkClass}>
          {tc('viewPlans')}
        </Link>
        {' · '}
        <Link href="/login" className={authDarkLinkClass}>
          {tc('signIn')}
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFallback />}>
      <SignupForm />
    </Suspense>
  );
}
