'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPinned } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function PatrolCheckLandingPage() {
  const params = useParams();
  const token = String(params.token || '');
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/patrol/check/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) {
          setValid(false);
          return;
        }
        const data = await r.json();
        setValid(!!data?.valid);
      })
      .catch(() => setValid(false));
  }, [token]);

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-950 dark:to-slate-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPinned className="size-5 text-primary" />
            Patrol checkpoint
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {valid === null ? <p className="text-muted-foreground">Checking QR…</p> : null}
          {valid === true ? (
            <>
              <p>This checkpoint QR is valid. Open the ControlOps mobile app while signed in to complete a GPS-validated scan.</p>
              <p className="text-xs text-muted-foreground font-mono break-all">Token: {token}</p>
            </>
          ) : null}
          {valid === false ? <p className="text-destructive">This QR token is invalid or inactive.</p> : null}
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
