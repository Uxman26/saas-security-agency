'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/language-switcher';
import { loginSchema } from '@/lib/validation';
import { useAuth } from '@/contexts/auth-context';
import { toast } from '@/lib/toast';
import { parsePaymentPending, parseEmailVerificationRequired, parseAccountLocked, parsePasswordResetRequired } from '@/lib/sidebar-modules';
import { api } from '@/lib/api';
import {
  Clock,
  Eye,
  EyeOff,
  FileText,
  Lock,
  Mail,
  MapPin,
  Shield,
  UserRound,
  Coins,
  ChevronRight,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Suspense } from 'react';

const ORANGE = '#F45100';

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 23 23" aria-hidden>
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#00a4ef" d="M12 1h10v10H12z" />
      <path fill="#7fba00" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.1 4 9.2 8.5 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.1 39.5 16 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.8-6.5 7.3l.1.1 6.2 5.2C37.2 39.2 44 34 44 24c0-1.3-.1-2.5-.4-3.5z" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M16.7 12.6c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.7-2.8-.7-1.4 0-2.8.9-3.5 2.2-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2 .8-1.2 1.1-2.3 1.1-2.4-.1 0-2.2-.8-2.2-3.4zM14.4 6.4c.6-.7 1-1.7.9-2.7-0.9.1-2 .6-2.6 1.3-.6.6-1.1 1.6-.9 2.5 1 .1 2-.5 2.6-1.1z" />
    </svg>
  );
}

const FEATURES = [
  { icon: Clock, title: 'Real-time shift tracking', desc: 'Monitor attendance, breaks, and overtime as it happens.' },
  { icon: MapPin, title: 'Geo-verified clock in/out', desc: 'Ensure accountability with GPS-verified check-ins and patrols.' },
  { icon: Shield, title: 'Incident reporting & rota management', desc: 'Streamline incident logs, compliance, and shift scheduling.' },
  { icon: Coins, title: 'Manage Expenses', desc: 'Track and manage operational expenses, costs and budgets.' },
  { icon: UserRound, title: 'Payroll', desc: 'Automate payroll, manage hours and stay compliant.' },
  { icon: FileText, title: 'Invoices', desc: 'Create, track and manage invoices with ease.' },
] as const;

function LoginForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, completeMfa } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [oauthProviders, setOauthProviders] = useState<Record<string, boolean>>({
    google: false,
    microsoft: false,
    apple: false,
  });
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);

  useEffect(() => {
    const err = searchParams.get('oauth_error');
    if (err) toast.error(err);
  }, [searchParams]);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const id = window.setInterval(() => {
      setLockoutSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [lockoutSeconds]);

  useEffect(() => {
    api.auth
      .oauthProviders()
      .then((res) => {
        const map: Record<string, boolean> = {};
        for (const p of res.providers || []) map[p.provider] = !!p.enabled;
        setOauthProviders(map);
      })
      .catch(() => undefined);
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember_me: true },
  });
  const rememberMe = watch('remember_me');

  const goAfterLogin = (role?: string | null) => {
    const r = (role || '').toLowerCase();
    router.push(r === 'client' || r === 'staff' ? '/my-portal' : '/dashboard');
  };

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
      const result = await login(data.email, data.password, data.remember_me ?? true);
      setLockoutSeconds(0);
      setPasswordResetRequired(false);
      if ('mfa_required' in result) {
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
      goAfterLogin(signedIn.role);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('mfaInvalid'));
    } finally {
      setLoading(false);
    }
  };

  const startOAuth = (provider: string) => {
    if (!oauthProviders[provider]) {
      toast.error(`${provider[0].toUpperCase()}${provider.slice(1)} Sign In is not configured yet.`);
      return;
    }
    window.location.href = api.auth.oauthStartUrl(provider, !!rememberMe);
  };

  const fieldClass =
    'h-11 rounded-lg border border-neutral-200 bg-white pl-10 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-[#F45100]/30 focus-visible:border-[#F45100]';

  return (
    <div className="relative min-h-svh overflow-hidden bg-[#F7F6F3] text-neutral-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 50% 40% at 8% 0%, rgba(244,81,0,0.14), transparent 55%), radial-gradient(ellipse 45% 40% at 100% 100%, rgba(255,180,120,0.22), transparent 50%)',
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-svh max-w-[1280px] flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-4 flex items-center justify-between gap-3 lg:mb-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/ControlOps-Logos/controlOps-icon.png"
              alt=""
              width={28}
              height={28}
              className="size-7 object-contain"
              priority
            />
            <span className="text-sm font-semibold tracking-tight" style={{ color: ORANGE }}>
              Shift Coverage Everywhere
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-neutral-200/80 bg-white/80 px-1 py-0.5 shadow-sm backdrop-blur">
              <Globe className="ms-2 size-3.5 text-neutral-500" aria-hidden />
              <LanguageSwitcher className="border-0 bg-transparent shadow-none dark:bg-transparent" />
            </div>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10 xl:gap-14">
          <section className="hidden lg:block">
            <h1 className="max-w-xl text-4xl font-bold leading-[1.15] tracking-tight text-neutral-900 xl:text-[2.75rem]">
              Smart Workforce Management for Smarter Operations
              <span style={{ color: ORANGE }}>.</span>
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-neutral-500">
              One platform to plan, manage, track, and optimise your workforce operations in real time.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex gap-3">
                  <div
                    className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: 'rgba(244,81,0,0.1)', color: ORANGE }}
                  >
                    <Icon className="size-4.5" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="relative mt-10 overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: 'Live Tracking', value: 'Active' },
                  { label: 'Compliance', value: '98%' },
                  { label: 'Incidents', value: '3 open' },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-white/80 bg-white/90 px-3 py-3 shadow-sm">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{s.label}</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">{s.value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-neutral-500">
                Plan shifts, verify attendance, and run payroll from one operational system.
              </p>
            </div>
          </section>

          <section className="mx-auto w-full max-w-[420px]">
            <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.08)] sm:p-8">
              <div className="mb-6 text-center">
                <div className="mb-3 flex items-center justify-center gap-2.5">
                  <Image
                    src="/ControlOps-Logos/controlOps-icon.png"
                    alt=""
                    width={36}
                    height={36}
                    className="size-9 object-contain"
                  />
                  <span className="text-lg font-bold tracking-wide text-neutral-900">CONTROL OPERATIONS</span>
                </div>
                <div className="mx-auto flex max-w-[220px] items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                  <span className="h-px flex-1 bg-neutral-200" />
                  Command with Clarity
                  <span className="h-px flex-1 bg-neutral-200" />
                </div>
                <h2 className="mt-5 text-2xl font-bold text-neutral-900">
                  {mfaToken ? t('mfaTitle') : 'Welcome back'}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  {mfaToken ? t('mfaSubtitle') : 'Sign in to manage your workforce'}
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
                      className={cn(fieldClass, 'pl-3 tracking-[0.3em] text-center text-lg')}
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      autoFocus
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading || mfaCode.length < 6}
                    className="h-11 w-full rounded-lg text-white hover:opacity-95"
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
                <>
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
                        <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
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
                        <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          className={cn(fieldClass, 'pr-10')}
                          {...register('password')}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
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
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                        <p className="font-medium">Account temporarily locked</p>
                        <p className="mt-0.5 text-amber-800/90">
                          Too many failed sign-in attempts. Try again in{' '}
                          <span className="font-semibold tabular-nums">{formatLockout(lockoutSeconds)}</span>.
                        </p>
                      </div>
                    )}

                    {passwordResetRequired && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
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
                      className="h-11 w-full rounded-lg text-base font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      style={{ background: ORANGE }}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        {loading
                          ? t('signingIn')
                          : lockoutSeconds > 0
                            ? `Locked (${formatLockout(lockoutSeconds)})`
                            : passwordResetRequired
                              ? 'Reset required'
                              : tc('signIn')}
                        {!loading && lockoutSeconds <= 0 && !passwordResetRequired && (
                          <ChevronRight className="size-4" />
                        )}
                      </span>
                    </Button>
                  </form>
                  <div className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-neutral-200" />
                    <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">or</span>
                    <span className="h-px flex-1 bg-neutral-200" />
                  </div>

                  <div className="space-y-2.5">
                    {(
                      [
                        { id: 'microsoft', label: 'Sign in with Microsoft', Icon: MicrosoftIcon },
                        { id: 'google', label: 'Sign in with Google', Icon: GoogleIcon },
                        { id: 'apple', label: 'Sign in with Apple', Icon: AppleIcon },
                      ] as const
                    ).map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => startOAuth(id)}
                        disabled={loading}
                        className={cn(
                          'flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-neutral-200 bg-white text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50',
                          !oauthProviders[id] && 'opacity-70'
                        )}
                      >
                        <Icon className="size-5 shrink-0" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>

                  <p className="mt-5 text-center text-sm text-neutral-500">
                    {tc('dontHaveAccount')}{' '}
                    <Link href="/pricing" className="font-semibold" style={{ color: ORANGE }}>
                      {tc('signUp')}
                    </Link>
                  </p>
                </>
              )}
            </div>

            <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-neutral-400">
              <span>© {new Date().getFullYear()} ControlOps. All rights reserved.</span>
              <span className="flex items-center gap-2">
                <Link href="/privacy" className="hover:text-neutral-600">
                  Privacy Notice
                </Link>
                <span aria-hidden>|</span>
                <Link href="/help" className="hover:text-neutral-600">
                  Support
                </Link>
              </span>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-svh bg-[#F7F6F3]" />}>
      <LoginForm />
    </Suspense>
  );
}
