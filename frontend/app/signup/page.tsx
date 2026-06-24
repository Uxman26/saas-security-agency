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

const INDUSTRIES = [
  'Security',
  'Cleaning & Facilities',
  'Event Staffing',
  'Temporary Staffing',
  'Other Shift-based Service Business',
];

const WORKFORCE = ['1–19', '20–49', '50–199', '200–999', '1000+'];

function SignupForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const tierParam = searchParams.get('tier');
  const subscription_tier = tierParam || undefined;
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
        <p>Loading your selected plan…</p>
        <p className="text-sm text-[#4B5563]">
          <Link href="/pricing" className="text-[#FD6203] hover:underline">View plans</Link>
          {' · '}
          <Link href="/login" className="text-[#FD6203] hover:underline">Sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <AuthShell
      title={t('signupTitle')}
      subtitle={t('signupSubtitle')}
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
          <Label htmlFor="full_name">{t('fullName')}</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#9CA3AF]" />
            <Input id="full_name" placeholder="John Smith" className="pl-10 h-11" {...register('full_name')} />
          </div>
          {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message as string}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t('email')}</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#9CA3AF]" />
            <Input id="email" type="email" placeholder="name@company.com" className="pl-10 h-11" {...register('email')} />
          </div>
          {errors.email && <p className="text-sm text-destructive">{errors.email.message as string}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t('password')}</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#9CA3AF]" />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a password"
              className="pl-10 pr-10 h-11"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#161E2C]"
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-destructive">{errors.password.message as string}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="company_name">{t('companyName')}</Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#9CA3AF]" />
            <Input id="company_name" placeholder="Acme Services Ltd" className="pl-10 h-11" {...register('company_name')} />
          </div>
          {errors.company_name && <p className="text-sm text-destructive">{errors.company_name.message as string}</p>}
        </div>
        <div className="space-y-2">
          <Label>{t('industry')}</Label>
          <Select onValueChange={(v) => setValue('industry', v, { shouldValidate: true })}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Select industry" /></SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
            </SelectContent>
          </Select>
          {errors.industry && <p className="text-sm text-destructive">{errors.industry.message as string}</p>}
        </div>
        <div className="space-y-2">
          <Label>{t('workforceSize')}</Label>
          <Select onValueChange={(v) => setValue('workforce_size', v, { shouldValidate: true })}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Select size" /></SelectTrigger>
            <SelectContent>
              {WORKFORCE.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
          {errors.workforce_size && <p className="text-sm text-destructive">{errors.workforce_size.message as string}</p>}
        </div>
        <p className="text-xs text-[#4B5563] leading-relaxed">
          By creating an account, you agree to the{' '}
          <Link href="/terms" className="text-[#FD6203] hover:underline">ControlOps Terms of Service</Link>
          {' '}and acknowledge the{' '}
          <Link href="/privacy" className="text-[#FD6203] hover:underline">Privacy Policy</Link>.
        </p>
        <Button type="submit" className="w-full h-11 bg-[#FD6203] hover:bg-[#DF3C01] text-white font-semibold" disabled={loading}>
          {loading ? t('creatingAccount') : t('createAccount')}
        </Button>
      </form>
    </AuthShell>
  );
}

function SignupFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F3F4F6] text-[#161E2C] px-4">
      <Loader2 className="size-8 animate-spin text-[#FD6203]" />
      <p>Preparing your signup form…</p>
      <noscript>
        <p className="text-sm max-w-md text-center">
          JavaScript is required to create an account. Enable JavaScript or{' '}
          <a href="/book-demo" className="text-[#FD6203] underline">book a demo</a> to get started.
        </p>
      </noscript>
      <p className="text-sm text-[#4B5563]">
        <a href="/pricing" className="text-[#FD6203] hover:underline">View plans</a>
        {' · '}
        <a href="/login" className="text-[#FD6203] hover:underline">Sign in</a>
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
