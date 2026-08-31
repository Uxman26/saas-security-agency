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
import { Auth3DShell } from '@/components/auth/auth-3d-shell';
import { loginSchema } from '@/lib/validation';
import { useAuth } from '@/contexts/auth-context';
import { toast } from '@/lib/toast';
import { parsePaymentPending, parseEmailVerificationRequired } from '@/lib/sidebar-modules';
import { Eye, EyeOff } from 'lucide-react';
import {
  authDarkBtnClass,
  authDarkErrorClass,
  authDarkFieldClass,
  authDarkLinkClass,
} from '@/lib/auth-styles';
import { cn } from '@/lib/utils';

const fieldClass = authDarkFieldClass;

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
      const signedIn = await login(data.email, data.password, data.remember_me ?? true);
      // Portal roles can only view the portal modules, so /dashboard would render an
      // empty shell before they navigated away themselves.
      const role = (signedIn?.role || '').toLowerCase();
      router.push(role === 'client' || role === 'staff' ? '/my-portal' : '/dashboard');
    } catch (err: unknown) {
      const pending = parsePaymentPending(err);
      if (pending?.receipt_ref) {
        router.push(`/payment-pending?ref=${encodeURIComponent(pending.receipt_ref)}`);
        return;
      }
      const verify = parseEmailVerificationRequired(err);
      if (verify?.email) {
        const q = new URLSearchParams({ email: verify.email });
        if (verify.receipt_ref) q.set('ref', verify.receipt_ref);
        router.push(`/verify-email?${q.toString()}`);
        return;
      }
      toast.error(err instanceof Error ? err.message : 'The email or password is incorrect.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Auth3DShell
      title={t('loginTitle')}
      subtitle={t('loginSubtitle')}
      topLink={{ href: '/pricing', label: tc('viewPlans') }}
      footer={
        <>
          {tc('dontHaveAccount')}{' '}
          <Link href="/pricing" className={authDarkLinkClass}>
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
          <Label htmlFor="email" className="text-sm font-medium text-white/70">
            {t('email')}
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            className={fieldClass}
            {...register('email')}
          />
          {errors.email && <p className={authDarkErrorClass}>{errors.email.message as string}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium text-white/70">
            {t('password')}
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              className={cn(fieldClass, 'pe-11')}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white"
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && <p className={authDarkErrorClass}>{errors.password.message as string}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-white/60">
            <input
              type="checkbox"
              className="size-4 rounded border-white/20 bg-white/5 accent-[#F45100]"
              {...register('remember_me')}
            />
            <span>{t('rememberMe')}</span>
          </label>
          <Link href="/forgot-password" className={authDarkLinkClass}>
            {t('forgotPassword')}
          </Link>
        </div>

        <Button type="submit" className={authDarkBtnClass} disabled={loading}>
          {loading ? t('signingIn') : tc('signIn')}
        </Button>
      </form>
    </Auth3DShell>
  );
}
