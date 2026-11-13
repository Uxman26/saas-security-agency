'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { homePathForRole } from '@/lib/nav-modules';
import { useAuth } from '@/contexts/auth-context';
import { toast } from '@/lib/toast';

function OAuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginWithToken } = useAuth();
  const [message, setMessage] = useState('Completing sign-in…');
  // loginWithToken is a fresh function on every AuthProvider render, and logging in
  // re-renders the provider. Without this guard the effect re-ran after every setUser,
  // cancelled the in-flight attempt and started another, so the redirect never fired.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
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
    // Drop the token from the address bar so it is not kept in history or sent as a Referer.
    window.history.replaceState(null, '', '/auth/callback');
    void (async () => {
      try {
        const user = await loginWithToken(token);
        if (ref) {
          router.replace(`/payment-pending?ref=${encodeURIComponent(ref)}`);
          return;
        }
        router.replace(homePathForRole(user.role));
      } catch (e) {
        setMessage('Sign-in failed');
        toast.error(e instanceof Error ? e.message : 'Sign-in failed');
        router.replace('/login');
      }
    })();
  }, [searchParams, loginWithToken, router]);

  return (
    <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-svh bg-background" />}>
      <OAuthCallbackInner />
    </Suspense>
  );
}
