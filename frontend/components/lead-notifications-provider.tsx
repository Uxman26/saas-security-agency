'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { can } from '@/lib/permissions';
import type { ComplianceAlert, ContractExpiryAlert } from '@/lib/types';

export type LeadNotif = {
  id: number;
  kind: string;
  title: string;
  body?: string;
  entity_id?: number;
  entity_type?: string;
  read_at?: string | null;
  created_at?: string;
};

type AlertsContextValue = {
  complianceAlerts: ComplianceAlert[];
  contractAlerts: ContractExpiryAlert[];
  leadAlerts: LeadNotif[];
  /** Unread notifications still not marked read */
  unreadCount: number;
  /** Badge shown on bell — cleared when panel opens until new unread arrive */
  badgeCount: number;
  refreshAlerts: () => Promise<void>;
  markLeadRead: (id: number) => Promise<void>;
  markAllLeadRead: () => Promise<void>;
  /** Clear badge and refresh list; does not mark notifications read */
  markPanelOpened: () => Promise<void>;
};

const AlertsContext = createContext<AlertsContextValue | null>(null);

export function isNotifUnread(n: LeadNotif) {
  return n.read_at == null || n.read_at === '';
}

export function LeadNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const seenBrowser = useRef<Set<number>>(new Set());
  /** Unread ids acknowledged by opening the panel (badge cleared for these) */
  const acknowledgedUnread = useRef<Set<number>>(new Set());
  const [complianceAlerts, setComplianceAlerts] = useState<ComplianceAlert[]>([]);
  const [contractAlerts, setContractAlerts] = useState<ContractExpiryAlert[]>([]);
  const [leadAlerts, setLeadAlerts] = useState<LeadNotif[]>([]);
  const [badgeEpoch, setBadgeEpoch] = useState(0);

  const canReadLeads = Boolean(
    user && user.role !== 'super_admin' && user.enabled_modules?.leads !== false && can(user, 'leads.read')
  );

  const refreshAlerts = useCallback(async () => {
    if (!user || user.role === 'super_admin') {
      setComplianceAlerts([]);
      setContractAlerts([]);
      setLeadAlerts([]);
      return;
    }

    const [complianceResult, contractsResult, leadsResult] = await Promise.allSettled([
      api.reports.compliance(30),
      api.reports.contractsExpiring(30),
      canReadLeads ? api.leads.notifications(false) : Promise.resolve([]),
    ]);
    if (complianceResult.status === 'fulfilled') setComplianceAlerts(complianceResult.value);
    if (contractsResult.status === 'fulfilled') setContractAlerts(contractsResult.value);
    if (leadsResult.status === 'fulfilled') {
      const rows = (leadsResult.value as LeadNotif[]) || [];
      setLeadAlerts(rows);
      for (const notification of rows) {
        if (!isNotifUnread(notification)) continue;
        const id = Number(notification.id);
        if (seenBrowser.current.has(id)) continue;
        seenBrowser.current.add(id);
        const title = String(notification.title || 'Lead notification');
        const body = String(notification.body || '');
        const url =
          notification.entity_type === 'lead' && notification.entity_id
            ? `/leads/${notification.entity_id}`
            : '/leads';
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          if (navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'SHOW_NOTIFICATION', title, body, url });
          } else {
            new Notification(title, { body });
          }
        }
      }
    }
  }, [user, canReadLeads]);

  const markLeadRead = useCallback(async (id: number) => {
    await api.leads.readNotification(id);
    acknowledgedUnread.current.add(id);
    setLeadAlerts((current) =>
      current.map((alert) =>
        alert.id === id ? { ...alert, read_at: new Date().toISOString() } : alert
      )
    );
    setBadgeEpoch((n) => n + 1);
  }, []);

  const markAllLeadRead = useCallback(async () => {
    if (!canReadLeads) return;
    await api.leads.readAllNotifications();
    const now = new Date().toISOString();
    setLeadAlerts((current) => {
      for (const alert of current) {
        if (isNotifUnread(alert)) acknowledgedUnread.current.add(alert.id);
      }
      return current.map((alert) => (isNotifUnread(alert) ? { ...alert, read_at: now } : alert));
    });
    setBadgeEpoch((n) => n + 1);
  }, [canReadLeads]);

  const markPanelOpened = useCallback(async () => {
    for (const alert of leadAlerts) {
      if (isNotifUnread(alert)) acknowledgedUnread.current.add(alert.id);
    }
    setBadgeEpoch((n) => n + 1);
    await refreshAlerts();
  }, [leadAlerts, refreshAlerts]);

  useEffect(() => {
    if (!user || user.role === 'super_admin') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    void refreshAlerts();
    const t = setInterval(() => void refreshAlerts(), 60000);
    return () => clearInterval(t);
  }, [user, refreshAlerts]);

  const unreadCount = useMemo(() => leadAlerts.filter(isNotifUnread).length, [leadAlerts]);

  const badgeCount = useMemo(() => {
    void badgeEpoch;
    return leadAlerts.filter((a) => isNotifUnread(a) && !acknowledgedUnread.current.has(a.id)).length;
  }, [leadAlerts, badgeEpoch]);

  const value = useMemo(
    () => ({
      complianceAlerts,
      contractAlerts,
      leadAlerts,
      unreadCount,
      badgeCount,
      refreshAlerts,
      markLeadRead,
      markAllLeadRead,
      markPanelOpened,
    }),
    [
      complianceAlerts,
      contractAlerts,
      leadAlerts,
      unreadCount,
      badgeCount,
      refreshAlerts,
      markLeadRead,
      markAllLeadRead,
      markPanelOpened,
    ]
  );

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useCentralAlerts() {
  const context = useContext(AlertsContext);
  if (!context) throw new Error('useCentralAlerts must be used inside LeadNotificationsProvider');
  return context;
}
