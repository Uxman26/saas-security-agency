'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Loader2, Mail } from 'lucide-react';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';
  const ref = searchParams.get('ref') || '';
  const [verifying, setVerifying] = useState(!!token);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.auth
      .verifyEmail(token)
      .then(() => {
        setVerified(true);
        toast.success('Email verified');
        if (ref) {
          router.replace(`/payment-pending?ref=${encodeURIComponent(ref)}`);
        }
      })
      .catch((e: Error) => toast.error(e.message || 'Verification failed'))
      .finally(() => setVerifying(false));
  }, [token, ref, router]);

  const resend = async () => {
    if (!email) {
      toast.warning('Email address is missing');
      return;
    }
    setResending(true);
    try {
      await api.auth.resendVerification(email);
      toast.success('Verification email sent');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not resend email');
    } finally {
      setResending(false);
    }
  };

  if (token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-lg shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{verified ? 'Email verified' : 'Verifying email'}</CardTitle>
            <CardDescription>
              {verifying ? 'Please wait while we confirm your email address.' : verified ? 'Redirecting…' : 'This link may be invalid or expired.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {verifying && <Loader2 className="size-8 animate-spin text-muted-foreground" />}
            {!verifying && !verified && (
              <>
                {email ? (
                  <Button variant="outline" onClick={() => void resend()} disabled={resending}>
                    {resending ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                    Resend verification email
                  </Button>
                ) : null}
                <Button asChild variant="ghost">
                  <Link href="/login">Back to sign in</Link>
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
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail className="size-6" />
          </div>
          <CardTitle className="text-2xl">Verify your email</CardTitle>
          <CardDescription>
            Your account has been created. We sent a verification link
            {email ? ` to ${email}` : ''}. Click the link in that email, then continue to payment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {email && (
            <Button className="w-full" variant="outline" onClick={() => void resend()} disabled={resending}>
              {resending ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              Resend verification email
            </Button>
          )}
          {ref && (
            <Button asChild className="w-full" variant="secondary">
              <Link href={`/payment-pending?ref=${encodeURIComponent(ref)}`}>View payment details</Link>
            </Button>
          )}
          <Button asChild className="w-full" variant="ghost">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
