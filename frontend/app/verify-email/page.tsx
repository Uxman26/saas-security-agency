'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Loader2, Mail } from 'lucide-react';

function VerifyEmailContent() {
  const t = useTranslations('verify');
  const tc = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';
  const ref = searchParams.get('ref') || '';
  const cycle = searchParams.get('cycle') || '';
  const [verifying, setVerifying] = useState(!!token);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.auth
      .verifyEmail(token)
      .then(() => {
        setVerified(true);
        toast.success(t('emailVerifiedToast'));
        if (ref) {
          const q = new URLSearchParams({ ref });
          if (cycle) q.set('cycle', cycle);
          router.replace(`/payment-pending?${q.toString()}`);
        }
      })
      .catch((e: Error) => toast.error(e.message || t('verificationFailed')))
      .finally(() => setVerifying(false));
  }, [token, ref, router, t]);

  const resend = async () => {
    if (!email) {
      toast.warning(t('emailMissing'));
      return;
    }
    setResending(true);
    try {
      await api.auth.resendVerification(email);
      toast.success(t('sent'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('couldNotResend'));
    } finally {
      setResending(false);
    }
  };

  if (token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
        <div className="absolute top-4 end-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-lg shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{verified ? t('verified') : t('verifying')}</CardTitle>
            <CardDescription>
              {verifying ? t('wait') : verified ? t('redirecting') : t('invalid')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {verifying && <Loader2 className="size-8 animate-spin text-muted-foreground" />}
            {!verifying && !verified && (
              <>
                {email ? (
                  <Button variant="outline" onClick={() => void resend()} disabled={resending}>
                    {resending ? <Loader2 className="size-4 me-2 animate-spin" /> : null}
                    {t('resend')}
                  </Button>
                ) : null}
                <Button asChild variant="ghost">
                  <Link href="/login">{tc('backToSignIn')}</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="absolute top-4 end-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail className="size-6" />
          </div>
          <CardTitle className="text-2xl">{t('title')}</CardTitle>
          <CardDescription>
            {t('description', { email: email ? t('emailTo', { email }) : '' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {email && (
            <Button className="w-full" variant="outline" onClick={() => void resend()} disabled={resending}>
              {resending ? <Loader2 className="size-4 me-2 animate-spin" /> : null}
              {t('resend')}
            </Button>
          )}
          {ref && (
            <Button asChild className="w-full" variant="secondary">
              <Link href={`/payment-pending?ref=${encodeURIComponent(ref)}${cycle ? `&cycle=${encodeURIComponent(cycle)}` : ''}`}>{t('viewPayment')}</Link>
            </Button>
          )}
          <Button asChild className="w-full" variant="ghost">
            <Link href="/login">{tc('backToSignIn')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  const tv = useTranslations('verify');
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{tv('loading')}</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
