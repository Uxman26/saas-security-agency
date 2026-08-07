'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Auth3DShell } from '@/components/auth/auth-3d-shell';
import { forgotPasswordSchema } from '@/lib/validation';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import {
  authDarkBtnClass,
  authDarkErrorClass,
  authDarkFieldClass,
  authDarkIconClass,
  authDarkLabelClass,
  authDarkLinkClass,
} from '@/lib/auth-styles';
import { ArrowLeft, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: { email: string }) => {
    setLoading(true);
    try {
      await api.auth.forgotPassword(data.email);
      setSent(true);
      toast.success(t('checkEmailReset'));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Auth3DShell
      title={t('forgotTitle')}
      subtitle={sent ? t('forgotSentSubtitle', { email: getValues('email') }) : t('forgotSubtitle')}
      topLink={{ href: '/login', label: tc('backToSignIn') }}
    >
      {!sent ? (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className={authDarkLabelClass}>
              {t('email')}
            </Label>
            <div className="relative">
              <Mail className={authDarkIconClass} />
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                className={cn(authDarkFieldClass, 'ps-10')}
                {...register('email')}
              />
            </div>
            {errors.email && <p className={authDarkErrorClass}>{errors.email.message as string}</p>}
          </div>
          <Button type="submit" className={authDarkBtnClass} disabled={loading}>
            {loading ? t('sending') : t('sendResetLink')}
          </Button>
        </form>
      ) : (
        <Button asChild className={authDarkBtnClass}>
          <Link href="/login">{tc('backToSignIn')}</Link>
        </Button>
      )}
      <Link
        href="/login"
        className="mt-6 flex items-center justify-center gap-1 text-sm text-white/50 transition-colors hover:text-white lg:justify-start"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t('backToLogin')}
      </Link>
    </Auth3DShell>
  );
}
