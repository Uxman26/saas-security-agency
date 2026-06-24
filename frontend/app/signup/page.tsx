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
import { AuthShell } from '@/components/auth/auth-shell';
import { signupSchema } from '@/lib/validation';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';
import { Building2, Eye, EyeOff, Lock, Mail, User, Loader2 } from 'lucide-react';
import { authFieldClass, authIconClass, authLabelClass, authSelectClass } from '@/lib/auth-styles';
import { INDUSTRY_VALUES, WORKFORCE_VALUES } from '@/lib/industry-options';

const INDUSTRIES = INDUSTRY_VALUES;
const WORKFORCE = WORKFORCE_VALUES;

function SignupForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const tb = useTranslations('marketing.bookDemo');
  const router = useRouter();
  const searchParams = useSearchParams();
  const tierParam = searchParams.get('tier');
  const subscription_tier = tierParam || undefined;
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
  }) => {
    setLoading(true);
    try {
      const res = await api.auth.signup({ ...data, subscription_tier });
      const ref = encodeURIComponent(res.receipt.ref_id);
      const email = encodeURIComponent(data.email);
      if (res.email_verification_required) {
        toast.success(t('accountCreatedVerify'));
        router.push(`/verify-email?email=${email}&ref=${ref}`);
      } else {
        toast.success(t('accountCreatedPayment'));
        router.push(`/payment-pending?ref=${ref}`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('signupFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (!subscription_tier) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F3F4F6] text-[#161E2C] px-4">
        <Loader2 className="size-8 animate-spin text-[#FD6203]" />
        <p>{t('signupLoadingPlan')}</p>
        <p className="text-sm text-[#4B5563]">
          <Link href="/pricing" className="text-[#FD6203] hover:underline">{tc('viewPlans')}</Link>
          {' · '}
          <Link href="/login" className="text-[#FD6203] hover:underline">{tc('signIn')}</Link>
        </p>
      </div>
    );
  }

  return (
    <AuthShell
      title={t('signupTitle')}
      subtitle={subscription_tier ? t('signupSubtitlePlan', { tier: subscription_tier }) : t('signupSubtitle')}
      topLink={{ href: '/login', label: tc('signIn') }}
      footer={
        <>
          {tc('alreadyHaveAccount')}{' '}
          <Link href="/login" className="font-semibold text-[#FD6203] hover:text-[#DF3C01]">
            {tc('signIn')}
          </Link>
          {' · '}
          <Link href="/pricing" className="font-semibold text-[#FD6203] hover:text-[#DF3C01]">
            {tc('viewPlans')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="full_name" className={authLabelClass}>{t('fullName')}</Label>
          <div className="relative">
            <User className={authIconClass} />
            <Input id="full_name" placeholder="John Smith" className={`ps-10 ${authFieldClass}`} {...register('full_name')} />
          </div>
          {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message as string}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className={authLabelClass}>{t('email')}</Label>
          <div className="relative">
            <Mail className={authIconClass} />
            <Input id="email" type="email" placeholder="name@company.com" className={`ps-10 ${authFieldClass}`} {...register('email')} />
          </div>
          {errors.email && <p className="text-sm text-destructive">{errors.email.message as string}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className={authLabelClass}>{t('password')}</Label>
          <div className="relative">
            <Lock className={authIconClass} />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a password"
              className={`ps-10 pe-10 ${authFieldClass}`}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#161E2C]"
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-destructive">{errors.password.message as string}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="company_name" className={authLabelClass}>{t('companyName')}</Label>
          <div className="relative">
            <Building2 className={authIconClass} />
            <Input id="company_name" placeholder="Acme Services Ltd" className={`ps-10 ${authFieldClass}`} {...register('company_name')} />
          </div>
          {errors.company_name && <p className="text-sm text-destructive">{errors.company_name.message as string}</p>}
        </div>
        <div className="space-y-2">
          <Label className={authLabelClass}>{t('industry')}</Label>
          <Select onValueChange={(v) => setValue('industry', v, { shouldValidate: true })}>
            <SelectTrigger className={authSelectClass}><SelectValue placeholder={t('selectIndustry')} /></SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((v, i) => <SelectItem key={v} value={v}>{industryLabels[i] ?? v}</SelectItem>)}
            </SelectContent>
          </Select>
          {errors.industry && <p className="text-sm text-destructive">{errors.industry.message as string}</p>}
        </div>
        <div className="space-y-2">
          <Label className={authLabelClass}>{t('workforceSize')}</Label>
          <Select onValueChange={(v) => setValue('workforce_size', v, { shouldValidate: true })}>
            <SelectTrigger className={authSelectClass}><SelectValue placeholder={t('selectSize')} /></SelectTrigger>
            <SelectContent>
              {WORKFORCE.map((v, i) => <SelectItem key={v} value={v}>{workforceLabels[i] ?? v}</SelectItem>)}
            </SelectContent>
          </Select>
          {errors.workforce_size && <p className="text-sm text-destructive">{errors.workforce_size.message as string}</p>}
        </div>
        <p className="text-xs text-[#4B5563] leading-relaxed">
          {t('signupPrivacyPrefix')}{' '}
          <Link href="/terms" className="text-[#FD6203] hover:underline">{t('signupPrivacyTerms')}</Link>
          {' '}{t('signupPrivacyAnd')}{' '}
          <Link href="/privacy" className="text-[#FD6203] hover:underline">{t('signupPrivacyPolicy')}</Link>.
        </p>
        <Button type="submit" className="w-full h-11 bg-[#FD6203] hover:bg-[#DF3C01] text-white font-semibold" disabled={loading}>
          {loading ? t('creatingAccount') : t('createAccount')}
        </Button>
      </form>
    </AuthShell>
  );
}

function SignupFallback() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F3F4F6] text-[#161E2C] px-4">
      <Loader2 className="size-8 animate-spin text-[#FD6203]" />
      <p>{t('signupPreparing')}</p>
      <p className="text-sm text-[#4B5563]">
        <Link href="/pricing" className="text-[#FD6203] hover:underline">{tc('viewPlans')}</Link>
        {' · '}
        <Link href="/login" className="text-[#FD6203] hover:underline">{tc('signIn')}</Link>
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
