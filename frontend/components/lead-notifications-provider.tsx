'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { can } from '@/lib/permissions';

export function LeadNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const seen = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!user || user.role === 'super_admin' || user.enabled_modules?.leads === false) return;
    if (!can(user, 'leads.read')) return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const poll = async () => {
      try {
        const rows = await api.leads.notifications(true);
        for (const n of rows) {
          const id = Number(n.id);
          if (seen.current.has(id)) continue;
          seen.current.add(id);
          const title = String(n.title || 'Lead notification');
          const body = String(n.body || '');
          const url = n.entity_type === 'lead' && n.entity_id ? `/leads/${n.entity_id}` : '/leads';

          if (Notification.permission === 'granted') {
            if (navigator.serviceWorker?.controller) {
              navigator.serviceWorker.controller.postMessage({ type: 'SHOW_NOTIFICATION', title, body, url });
            } else {
              new Notification(title, { body });
            }
          }
        }
      } catch {
        /* ignore */
      }
    };

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    poll();
    const t = setInterval(poll, 60000);
    return () => clearInterval(t);
  }, [user]);

  return <>{children}</>;
}
