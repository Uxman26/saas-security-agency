'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { homePathForRole } from '@/lib/nav-modules';
import { useAuth } from '@/contexts/auth-context';
import { toast } from '@/lib/toast';

function OAuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginWithToken } = useAuth();
  const [message, setMessage] = useState('Completing sign-in…');

  useEffect(() => {
    const token = searchParams.get('token');
    const ref = searchParams.get('ref');
    const err = searchParams.get('oauth_error') || searchParams.get('error');
    if (err) {
      toast.error(err);
      router.replace(`/login?oauth_error=${encodeURIComponent(err)}`);
      return;
    }
    if (!token) {
      toast.error('Missing sign-in token');
      router.replace('/login');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const user = await loginWithToken(token);
        if (cancelled) return;
        if (ref) {
          router.replace(`/payment-pending?ref=${encodeURIComponent(ref)}`);
          return;
        }
        router.replace(homePathForRole(user.role));
      } catch (e) {
        if (cancelled) return;
        setMessage('Sign-in failed');
        toast.error(e instanceof Error ? e.message : 'Sign-in failed');
        router.replace('/login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, loginWithToken, router]);

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#F7F6F3] text-sm text-neutral-600">
      {message}
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-svh bg-[#F7F6F3]" />}>
      <OAuthCallbackInner />
    </Suspense>
  );
}
