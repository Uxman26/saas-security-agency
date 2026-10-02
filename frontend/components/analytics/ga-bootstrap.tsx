'use client';

import { useEffect, useRef } from 'react';
import { GA_MEASUREMENT_ID } from '@/lib/site';
import {
  applyConsentDefaults,
  readConsent,
  trackPageView,
  updateConsent,
} from '@/lib/analytics';

function loadGtagScript(id: string) {
  if (document.getElementById('ga4-gtag')) return;
  const s = document.createElement('script');
  s.id = 'ga4-gtag';
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', id, {
    anonymize_ip: true,
    send_page_view: false,
  });
}

export function GaBootstrap() {
  const booted = useRef(false);

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    applyConsentDefaults();
    const sync = () => {
      const accepted = readConsent() === 'accepted';
      updateConsent(accepted);
      if (accepted && !booted.current) {
        loadGtagScript(GA_MEASUREMENT_ID);
        booted.current = true;
        trackPageView(window.location.pathname);
      }
    };
    sync();
    const onConsent = () => sync();
    window.addEventListener('controlops-consent', onConsent);
    return () => window.removeEventListener('controlops-consent', onConsent);
  }, []);

  return null;
}
