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
  unreadCount: number;
  badgeCount: number;
  refreshAlerts: () => Promise<void>;
  markLeadRead: (id: number) => Promise<void>;
  markAllLeadRead: () => Promise<void>;
  markPanelOpened: () => Promise<void>;
};

const AlertsContext = createContext<AlertsContextValue | null>(null);
const NOTIF_POLL_MS = 90_000;
const ALERT_POLL_MS = 5 * 60_000;

export function isNotifUnread(n: LeadNotif) {
  return n.read_at == null || n.read_at === '';
}

export function LeadNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const seenBrowser = useRef<Set<number>>(new Set());
  const acknowledgedUnread = useRef<Set<number>>(new Set());
  const lastUnread = useRef(0);
  const [complianceAlerts, setComplianceAlerts] = useState<ComplianceAlert[]>([]);
  const [contractAlerts, setContractAlerts] = useState<ContractExpiryAlert[]>([]);
  const [leadAlerts, setLeadAlerts] = useState<LeadNotif[]>([]);
  const [serverUnread, setServerUnread] = useState(0);
  const [badgeEpoch, setBadgeEpoch] = useState(0);

  const canReadLeads = Boolean(
    user && user.role !== 'super_admin' && user.enabled_modules?.leads !== false && can(user, 'leads.read')
  );

  const refreshLeadNotifications = useCallback(async () => {
    if (!user || user.role === 'super_admin' || !canReadLeads) {
      setLeadAlerts([]);
      setServerUnread(0);
      lastUnread.current = 0;
      return;
    }
    const [countResult, listResult] = await Promise.allSettled([
      api.leads.unreadNotificationCount(),
      api.leads.notifications(false),
    ]);
    if (countResult.status === 'fulfilled') {
      setServerUnread(Number(countResult.value?.count || 0));
    }
    if (listResult.status === 'fulfilled') {
      const rows = (listResult.value as LeadNotif[]) || [];
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

  const refreshReportAlerts = useCallback(async () => {
    if (!user || user.role === 'super_admin') {
      setComplianceAlerts([]);
      setContractAlerts([]);
      return;
    }
    const [complianceResult, contractsResult] = await Promise.allSettled([
      api.reports.compliance(30),
      api.reports.contractsExpiring(30),
    ]);
    if (complianceResult.status === 'fulfilled') setComplianceAlerts(complianceResult.value);
    if (contractsResult.status === 'fulfilled') setContractAlerts(contractsResult.value);
  }, [user]);

  const refreshAlerts = useCallback(async () => {
    await Promise.all([refreshLeadNotifications(), refreshReportAlerts()]);
  }, [refreshLeadNotifications, refreshReportAlerts]);

  const markLeadRead = useCallback(async (id: number) => {
    await api.leads.readNotification(id);
    acknowledgedUnread.current.add(id);
    setLeadAlerts((current) =>
      current.map((alert) =>
        alert.id === id ? { ...alert, read_at: new Date().toISOString() } : alert
      )
    );
    setServerUnread((n) => Math.max(0, n - 1));
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
    setServerUnread(0);
    setBadgeEpoch((n) => n + 1);
  }, [canReadLeads]);

  const markPanelOpened = useCallback(async () => {
    for (const alert of leadAlerts) {
      if (isNotifUnread(alert)) acknowledgedUnread.current.add(alert.id);
    }
    setBadgeEpoch((n) => n + 1);
    await refreshLeadNotifications();
  }, [leadAlerts, refreshLeadNotifications]);

  useEffect(() => {
    if (!user || user.role === 'super_admin') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    void refreshAlerts();

    const tickNotifs = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshLeadNotifications();
    };
    const tickReports = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshReportAlerts();
    };

    const notifTimer = setInterval(tickNotifs, NOTIF_POLL_MS);
    const reportTimer = setInterval(tickReports, ALERT_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshLeadNotifications();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(notifTimer);
      clearInterval(reportTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, refreshAlerts, refreshLeadNotifications, refreshReportAlerts]);

  const unreadCount = useMemo(() => {
    const local = leadAlerts.filter(isNotifUnread).length;
    return Math.max(local, serverUnread);
  }, [leadAlerts, serverUnread]);

  useEffect(() => {
    if (serverUnread > lastUnread.current) {
      setBadgeEpoch((n) => n + 1);
    }
    lastUnread.current = serverUnread;
  }, [serverUnread]);

  const badgeCount = useMemo(() => {
    void badgeEpoch;
    const unacked = leadAlerts.filter((a) => isNotifUnread(a) && !acknowledgedUnread.current.has(a.id)).length;
    return Math.max(unacked, Math.max(0, serverUnread - acknowledgedUnread.current.size));
  }, [leadAlerts, badgeEpoch, serverUnread]);

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
