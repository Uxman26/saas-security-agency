'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Auth3DShell } from '@/components/auth/auth-3d-shell';
import { resetPasswordSchema } from '@/lib/validation';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import {
  authDarkBtnClass,
  authDarkErrorClass,
  authDarkFieldClass,
  authDarkLabelClass,
  authDarkLinkClass,
} from '@/lib/auth-styles';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { z } from 'zod';

type FormData = z.infer<typeof resetPasswordSchema>;

function ResetPasswordForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: FormData) => {
    if (!token) {
      toast.error(t('invalidResetToken'));
      return;
    }
    setLoading(true);
    try {
      await api.auth.resetPassword(token, data.password);
      toast.success(t('passwordUpdated'));
      router.push('/login');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Auth3DShell title={t('invalidResetLink')} subtitle={t('invalidResetDesc')}>
        <Button asChild className={authDarkBtnClass}>
          <Link href="/forgot-password">{t('requestNewLink')}</Link>
        </Button>
        <Link href="/login" className={cn('mt-6 block text-center text-sm lg:text-start', authDarkLinkClass)}>
          {tc('backToSignIn')}
        </Link>
      </Auth3DShell>
    );
  }

  return (
    <Auth3DShell
      title={t('resetTitle')}
      subtitle={t('resetSubtitle')}
      topLink={{ href: '/login', label: tc('backToSignIn') }}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password" className={authDarkLabelClass}>
            {t('newPassword')}
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPw ? 'text' : 'password'}
              className={cn(authDarkFieldClass, 'pe-10')}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white"
              aria-label={showPw ? t('hidePassword') : t('showPassword')}
            >
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && <p className={authDarkErrorClass}>{errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm" className={authDarkLabelClass}>
            {t('confirmPassword')}
          </Label>
          <div className="relative">
            <Input
              id="confirm"
              type={showConfirm ? 'text' : 'password'}
              className={cn(authDarkFieldClass, 'pe-10')}
              {...register('confirm')}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white"
              aria-label={showConfirm ? t('hidePassword') : t('showPassword')}
            >
              {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.confirm && <p className={authDarkErrorClass}>{errors.confirm.message}</p>}
        </div>
        <Button type="submit" className={authDarkBtnClass} disabled={loading}>
          {loading ? t('updating') : t('updatePassword')}
        </Button>
      </form>
      <Link href="/login" className={cn('mt-6 block text-center text-sm lg:text-start', authDarkLinkClass)}>
        {tc('backToSignIn')}
      </Link>
    </Auth3DShell>
  );
}

export default function ResetPasswordPage() {
  const tv = useTranslations('verify');
  return (
    <Suspense
      fallback={
        <div className="dark flex min-h-svh items-center justify-center bg-[#05070a] text-white/50">
          {tv('loading')}
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
