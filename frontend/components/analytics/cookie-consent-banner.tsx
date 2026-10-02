'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { GA_MEASUREMENT_ID } from '@/lib/site';
import { readConsent, writeConsent } from '@/lib/analytics';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    if (readConsent() === 'unset') setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[80] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use optional analytics cookies (Google Analytics) to understand how the site is used and improve
          signup and subscription flows. Essential cookies stay on for language and sign-in.{' '}
          <Link href="/cookies" className="underline underline-offset-2 text-foreground">
            Cookie policy
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              writeConsent('rejected');
              setVisible(false);
            }}
          >
            Essential only
          </Button>
          <Button
            size="sm"
            onClick={() => {
              writeConsent('accepted');
              setVisible(false);
            }}
          >
            Accept analytics
          </Button>
        </div>
      </div>
    </div>
  );
}
