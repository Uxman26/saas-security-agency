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
};

type AlertsContextValue = {
  complianceAlerts: ComplianceAlert[];
  contractAlerts: ContractExpiryAlert[];
  leadAlerts: LeadNotif[];
  refreshAlerts: () => Promise<void>;
  markLeadRead: (id: number) => Promise<void>;
};

const AlertsContext = createContext<AlertsContextValue | null>(null);

export function LeadNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const seen = useRef<Set<number>>(new Set());
  const [complianceAlerts, setComplianceAlerts] = useState<ComplianceAlert[]>([]);
  const [contractAlerts, setContractAlerts] = useState<ContractExpiryAlert[]>([]);
  const [leadAlerts, setLeadAlerts] = useState<LeadNotif[]>([]);

  const refreshAlerts = useCallback(async () => {
    if (!user || user.role === 'super_admin') {
      setComplianceAlerts([]);
      setContractAlerts([]);
      setLeadAlerts([]);
      return;
    }

    const canReadLeads = user.enabled_modules?.leads !== false && can(user, 'leads.read');
    const [complianceResult, contractsResult, leadsResult] = await Promise.allSettled([
      api.reports.compliance(30),
      api.reports.contractsExpiring(30),
      canReadLeads ? api.leads.notifications(true) : Promise.resolve([]),
    ]);
    if (complianceResult.status === 'fulfilled') setComplianceAlerts(complianceResult.value);
    if (contractsResult.status === 'fulfilled') setContractAlerts(contractsResult.value);
    if (leadsResult.status === 'fulfilled') {
      const rows = leadsResult.value as LeadNotif[];
      setLeadAlerts(rows);
      for (const notification of rows) {
        const id = Number(notification.id);
        if (seen.current.has(id)) continue;
        seen.current.add(id);
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
  }, [user]);

  const markLeadRead = useCallback(async (id: number) => {
    await api.leads.readNotification(id);
    setLeadAlerts((current) => current.filter((alert) => alert.id !== id));
  }, []);

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

  const value = useMemo(
    () => ({ complianceAlerts, contractAlerts, leadAlerts, refreshAlerts, markLeadRead }),
    [complianceAlerts, contractAlerts, leadAlerts, refreshAlerts, markLeadRead]
  );

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useCentralAlerts() {
  const context = useContext(AlertsContext);
  if (!context) throw new Error('useCentralAlerts must be used inside LeadNotificationsProvider');
  return context;
}
