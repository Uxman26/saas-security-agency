'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { homePathForRole } from '@/lib/nav-modules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { superAdminLoginSchema } from '@/lib/validation';
import { useAuth } from '@/contexts/auth-context';
import { toast } from '@/lib/toast';
import { parseAccountLocked, parsePasswordResetRequired } from '@/lib/sidebar-modules';
import { setLocale } from '@/actions/locale';
import { ChevronRight, Eye, EyeOff, Globe, Lock, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoginHeroPanel } from '@/components/auth/login-hero-panel';

const ORANGE = '#F45100';

function LoginLocale() {
  const locale = useLocale();
  const router = useRouter();

  return (
    <div className="flex items-center text-neutral-500">
      <Globe className="size-4 shrink-0" aria-hidden />
      <Select
        value={locale}
        onValueChange={async (next) => {
          if (next === locale) return;
          await setLocale(next);
          router.refresh();
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label="Language"
          className="h-8 border-0 bg-transparent px-1.5 text-[13px] font-medium text-neutral-600 shadow-none hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent"
        >
          {locale === 'ar' ? 'العربية' : 'English'}
        </SelectTrigger>
        <SelectContent align="end" className="min-w-[9rem]">
          <SelectItem value="en">English</SelectItem>
          <SelectItem value="ar">العربية</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function SuperAdminLoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const { login, completeMfa, logout, user, isAuthenticated, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    router.replace(homePathForRole(user?.role));
  }, [authLoading, isAuthenticated, router, user?.role]);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const id = window.setInterval(() => {
      setLockoutSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [lockoutSeconds]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(superAdminLoginSchema),
    defaultValues: { email: '', password: '', remember_me: true },
  });

  const formatLockout = (total: number) => {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const signInDisabled = loading || lockoutSeconds > 0 || passwordResetRequired;

  const onSubmit = async (data: { email: string; password: string; remember_me?: boolean }) => {
    if (signInDisabled) return;
    setLoading(true);
    try {
      const result = await login(undefined, data.email, data.password, data.remember_me ?? true);
      setLockoutSeconds(0);
      setPasswordResetRequired(false);
      if ('mfa_required' in result) {
        setMfaToken(result.mfa_token);
        setMfaCode('');
        return;
      }
      if (result.user.role !== 'super_admin') {
        await logout();
        toast.error('The email or password is incorrect.');
        return;
      }
      router.push(homePathForRole(result.user.role));
    } catch (err: unknown) {
      const locked = parseAccountLocked(err);
      if (locked) {
        const secs = Math.max(1, Math.ceil(locked.retry_after_seconds || 15 * 60));
        setLockoutSeconds(secs);
        setPasswordResetRequired(false);
        toast.error(locked.message || 'Account temporarily locked.');
        return;
      }
      const resetReq = parsePasswordResetRequired(err);
      if (resetReq) {
        setPasswordResetRequired(true);
        setLockoutSeconds(0);
        toast.error(resetReq.message || 'Password reset required.');
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
      router.push(homePathForRole(signedIn.role));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('mfaInvalid'));
    } finally {
      setLoading(false);
    }
  };

  const fieldClass =
    'h-12 rounded-xl border border-neutral-200 bg-white pl-10 pr-3 text-[15px] text-neutral-800 placeholder:text-neutral-400 shadow-none focus-visible:ring-2 focus-visible:ring-[#F45100]/25 focus-visible:border-[#F45100]';

  return (
    <div className="relative min-h-svh overflow-hidden bg-[#F7F8FB] text-neutral-900 scheme-light">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 48% 52% at 4% -4%, rgba(255,140,50,0.34), transparent 58%), radial-gradient(ellipse 32% 36% at 96% 108%, rgba(255,176,110,0.14), transparent 52%)',
        }}
      />

      <div className="relative z-10 grid min-h-svh w-full lg:grid-cols-[minmax(0,1.2fr)_minmax(460px,0.8fr)]">
        <section className="relative hidden min-h-svh lg:block">
          <LoginHeroPanel />
        </section>

        <section className="relative flex min-h-svh flex-col px-4 pb-8 sm:px-8 lg:px-8 lg:pr-14">
          <div className="flex justify-end pt-4 lg:pt-5">
            <LoginLocale />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="w-full max-w-[440px] rounded-[32px] border border-white bg-white px-7 py-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:px-10 sm:py-10">
              <div className="mb-6 flex justify-center">
                <Image
                  src="/ControlOps-Logos/controlOps-horizontal-logo-card.png"
                  alt="Control Operations — Command with Clarity"
                  width={320}
                  height={86}
                  priority
                  unoptimized
                  className="h-[82px] w-auto object-contain"
                />
              </div>

              <div className="mb-7 text-center">
                <h1 className="text-[32px] font-bold leading-tight tracking-tight text-neutral-900">
                  {mfaToken ? t('mfaTitle') : 'Administrator sign in'}
                </h1>
                <p className="mt-1.5 text-[15px] text-neutral-500">
                  {mfaToken ? t('mfaSubtitle') : 'Sign in with your administrator credentials'}
                </p>
              </div>

              {mfaToken ? (
                <form onSubmit={onMfaSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="mfa_code" className="text-sm font-medium text-neutral-700">
                      {t('mfaCode')}
                    </Label>
                    <Input
                      id="mfa_code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      placeholder="000000"
                      className={cn(fieldClass, 'pl-3 text-center text-lg tracking-[0.3em]')}
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      autoFocus
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading || mfaCode.length < 6}
                    className="h-12 w-full rounded-xl text-white hover:opacity-95"
                    style={{ background: ORANGE }}
                  >
                    {loading ? t('verifyingMfa') : t('verifyMfa')}
                  </Button>
                  <button
                    type="button"
                    className="w-full text-center text-sm font-medium"
                    style={{ color: ORANGE }}
                    onClick={() => {
                      setMfaToken(null);
                      setMfaCode('');
                    }}
                  >
                    {t('mfaBack')}
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit(onSubmit)(e);
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium text-neutral-700">
                      Email address
                    </Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        className={fieldClass}
                        {...register('email')}
                      />
                    </div>
                    {errors.email && (
                      <p className="text-xs text-red-600">{errors.email.message as string}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-sm font-medium text-neutral-700">
                      {t('password')}
                    </Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className={cn(fieldClass, 'pr-11')}
                        {...register('password')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                        aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-xs text-red-600">{errors.password.message as string}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 text-sm">
                    <label className="flex cursor-pointer items-center gap-2 text-neutral-600">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-neutral-300"
                        style={{ accentColor: ORANGE }}
                        {...register('remember_me')}
                      />
                      <span>{t('rememberMe')}</span>
                    </label>
                    <Link href="/forgot-password" className="font-medium" style={{ color: ORANGE }}>
                      {t('forgotPassword')}
                    </Link>
                  </div>

                  {lockoutSeconds > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                      <p className="font-medium">Account temporarily locked</p>
                      <p className="mt-0.5 text-amber-800/90">
                        Too many failed sign-in attempts. Try again in{' '}
                        <span className="font-semibold tabular-nums">{formatLockout(lockoutSeconds)}</span>.
                      </p>
                    </div>
                  )}

                  {passwordResetRequired && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
                      <p className="font-medium">Password reset required</p>
                      <p className="mt-0.5">
                        Your account is locked until you reset your password.{' '}
                        <Link href="/forgot-password" className="font-semibold underline">
                          Reset password
                        </Link>
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={signInDisabled}
                    className="relative h-12 w-full rounded-xl text-[15px] font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    style={{ background: `linear-gradient(180deg, #FF6A1F 0%, ${ORANGE} 100%)` }}
                  >
                    <span>
                      {loading
                        ? t('signingIn')
                        : lockoutSeconds > 0
                          ? `Locked (${formatLockout(lockoutSeconds)})`
                          : passwordResetRequired
                            ? 'Reset required'
                            : 'Sign In'}
                    </span>
                    {!loading && lockoutSeconds <= 0 && !passwordResetRequired && (
                      <ChevronRight className="absolute right-4 size-5" />
                    )}
                  </Button>
                </form>
              )}
            </div>

            <footer className="mt-6 flex w-full max-w-[440px] flex-wrap items-center justify-between gap-2 px-1 text-xs text-neutral-400">
              <span>© {new Date().getFullYear()} ControlOps. All rights reserved.</span>
            </footer>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function SuperAdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-svh bg-[#F7F8FB]" />}>
      <SuperAdminLoginForm />
    </Suspense>
  );
}
