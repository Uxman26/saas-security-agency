'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GA_MEASUREMENT_ID } from '@/lib/site';
import { clearConsent, readConsent, writeConsent, type CookieConsent } from '@/lib/analytics';

export function CookiePreferences() {
  const [choice, setChoice] = useState<CookieConsent>('unset');

  useEffect(() => {
    setChoice(readConsent());
    const onConsent = () => setChoice(readConsent());
    window.addEventListener('controlops-consent', onConsent);
    return () => window.removeEventListener('controlops-consent', onConsent);
  }, []);

  if (!GA_MEASUREMENT_ID) {
    return (
      <p className="text-sm text-muted-foreground">
        Optional analytics is not enabled on this deployment. Only essential cookies and storage are used.
      </p>
    );
  }

  return (
    <div className="not-prose my-8 rounded-xl border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-base font-semibold text-foreground">Manage analytics cookies</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Current choice:{' '}
          <span className="font-medium text-foreground">
            {choice === 'accepted' ? 'Analytics accepted' : choice === 'rejected' ? 'Essential only' : 'Not set'}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            writeConsent('rejected');
            setChoice('rejected');
          }}
        >
          Essential only
        </Button>
        <Button
          size="sm"
          onClick={() => {
            writeConsent('accepted');
            setChoice('accepted');
          }}
        >
          Accept analytics
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            clearConsent();
            setChoice('unset');
          }}
        >
          Clear choice
        </Button>
      </div>
    </div>
  );
}
