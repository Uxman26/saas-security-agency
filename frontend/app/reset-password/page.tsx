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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { resetPasswordSchema } from '@/lib/validation';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { authFieldClass, authLabelClass } from '@/lib/auth-styles';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
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
      <Card className="relative w-full max-w-md shadow-xl border-primary/10 bg-card/95">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t('invalidResetLink')}</CardTitle>
          <CardDescription>{t('invalidResetDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/forgot-password">{t('requestNewLink')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative w-full max-w-md shadow-xl border-primary/10 bg-card/95">
      <CardHeader className="text-center space-y-2">
        <div className="mx-auto rounded-full bg-primary/10 p-3 w-fit">
          <KeyRound className="size-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">{t('resetTitle')}</CardTitle>
        <CardDescription>{t('resetSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className={authLabelClass}>{t('newPassword')}</Label>
            <div className="relative">
              <Input id="password" type={showPw ? 'text' : 'password'} className={`pe-10 ${authFieldClass}`} {...register('password')} />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1" aria-label={showPw ? t('hidePassword') : t('showPassword')}>
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm" className={authLabelClass}>{t('confirmPassword')}</Label>
            <div className="relative">
              <Input id="confirm" type={showConfirm ? 'text' : 'password'} className={`pe-10 ${authFieldClass}`} {...register('confirm')} />
              <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1" aria-label={showConfirm ? t('hidePassword') : t('showPassword')}>
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('updating') : t('updatePassword')}
          </Button>
        </form>
        <Link href="/login" className="mt-4 block text-center text-sm text-primary hover:underline">
          {tc('backToSignIn')}
        </Link>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  const tv = useTranslations('verify');
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="absolute top-4 end-4">
        <ThemeToggle />
      </div>
      <Suspense fallback={<div className="text-muted-foreground">{tv('loading')}</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
