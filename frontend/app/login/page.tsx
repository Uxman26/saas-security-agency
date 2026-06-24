'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/auth/auth-shell';
import { loginSchema } from '@/lib/validation';
import { useAuth } from '@/contexts/auth-context';
import { toast } from '@/lib/toast';
import { parsePaymentPending } from '@/lib/sidebar-modules';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { authFieldClass, authIconClass, authLabelClass } from '@/lib/auth-styles';

export default function LoginPage() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      remember_me: true,
    },
  });

  const onSubmit = async (data: { email: string; password: string; remember_me?: boolean }) => {
    setLoading(true);
    try {
      await login(data.email, data.password, data.remember_me ?? true);
      router.push('/dashboard');
    } catch (err: unknown) {
      const pending = parsePaymentPending(err);
      if (pending?.receipt_ref) {
        router.push(`/payment-pending?ref=${encodeURIComponent(pending.receipt_ref)}`);
        return;
      }
      toast.error(err instanceof Error ? err.message : t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t('loginTitle')}
      subtitle={t('loginSubtitle')}
      topLink={{ href: '/pricing', label: tc('viewPlans') }}
      footer={
        <>
          {tc('dontHaveAccount')}{' '}
          <Link href="/pricing" className="font-semibold text-[#FD6203] hover:text-[#DF3C01]">
            {tc('signUp')}
          </Link>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(onSubmit)(e);
        }}
        className="space-y-5"
      >
        <div className="space-y-2">
          <Label htmlFor="email" className={authLabelClass}>
            {t('email')}
          </Label>
          <div className="relative">
            <Mail className={authIconClass} />
            <Input
              id="email"
              type="email"
              placeholder="name@company.com"
              className={`ps-10 ${authFieldClass}`}
              {...register('email')}
            />
          </div>
          {errors.email && <p className="text-sm text-destructive">{errors.email.message as string}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className={authLabelClass}>
            {t('password')}
          </Label>
          <div className="relative">
            <Lock className={authIconClass} />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
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
        <div className="flex items-center justify-between gap-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer text-[#4B5563]">
            <input
              type="checkbox"
              className="size-4 rounded border-[#D1D5DB] accent-[#FD6203]"
              {...register('remember_me')}
            />
            <span>{t('rememberMe')}</span>
          </label>
          <Link href="/forgot-password" className="font-medium text-[#FD6203] hover:text-[#DF3C01]">
            {t('forgotPassword')}
          </Link>
        </div>
        <Button
          type="submit"
          className="w-full h-11 bg-[#FD6203] hover:bg-[#DF3C01] text-white font-semibold shadow-sm"
          disabled={loading}
        >
          {loading ? t('signingIn') : tc('signIn')}
        </Button>
      </form>
    </AuthShell>
  );
}
