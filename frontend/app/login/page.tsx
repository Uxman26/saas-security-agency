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
  const { login, completeMfa } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

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

  const goAfterLogin = (role?: string | null) => {
    const r = (role || '').toLowerCase();
    router.push(r === 'client' || r === 'staff' ? '/my-portal' : '/dashboard');
  };

  const onSubmit = async (data: { email: string; password: string; remember_me?: boolean }) => {
    setLoading(true);
    try {
      const result = await login(data.email, data.password, data.remember_me ?? true);
      if ('mfa_required' in result && result.mfa_required) {
        setMfaToken(result.mfa_token);
        setMfaCode('');
        return;
      }
      goAfterLogin(result.user.role);
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

  const onMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken || mfaCode.trim().length < 6) {
      toast.error(t('mfaCodeRequired'));
      return;
    }
    setLoading(true);
    try {
      const signedIn = await completeMfa(mfaToken, mfaCode.trim());
      goAfterLogin(signedIn.role);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('mfaInvalid'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Auth3DShell
      title={mfaToken ? t('mfaTitle') : t('loginTitle')}
      subtitle={mfaToken ? t('mfaSubtitle') : t('loginSubtitle')}
      topLink={{ href: '/pricing', label: tc('viewPlans') }}
      footer={
        mfaToken ? (
          <button
            type="button"
            className={authDarkLinkClass}
            onClick={() => {
              setMfaToken(null);
              setMfaCode('');
            }}
          >
            {t('mfaBack')}
          </button>
        ) : (
          <>
            {tc('dontHaveAccount')}{' '}
            <Link href="/pricing" className={authDarkLinkClass}>
              {tc('signUp')}
            </Link>
          </>
        )
      }
    >
      {mfaToken ? (
        <form onSubmit={onMfaSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="mfa_code" className="text-sm font-medium text-white/70">
              {t('mfaCode')}
            </Label>
            <Input
              id="mfa_code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              placeholder="000000"
              className={cn(fieldClass, 'tracking-[0.3em] text-center text-lg')}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              autoFocus
            />
          </div>
          <Button type="submit" className={authDarkBtnClass} disabled={loading || mfaCode.length < 6}>
            {loading ? t('verifyingMfa') : t('verifyMfa')}
          </Button>
        </form>
      ) : (
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
      )}
    </Auth3DShell>
  );
}
