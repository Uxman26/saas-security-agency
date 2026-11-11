import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const REFRESH_MS = 60_000;

const live = (on: boolean) =>
  on ? { refetchInterval: REFRESH_MS, refetchIntervalInBackground: false } : {};

/** Cached dashboard overview — avoids refetching on every visit. */
export function useDashboardOverview(enabled = true, autoRefresh = false) {
  return useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.reports.dashboard(),
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    ...live(autoRefresh),
  });
}

export async function fetchDashboardAlerts() {
  const [compliance, contracts] = await Promise.allSettled([
    api.reports.compliance(30),
    api.reports.contractsExpiring(30),
  ]);
  if (compliance.status === 'rejected' && contracts.status === 'rejected') throw compliance.reason;
  return {
    compliance: compliance.status === 'fulfilled' ? compliance.value : [],
    contracts: contracts.status === 'fulfilled' ? contracts.value : [],
  };
}

export function useDashboardAlerts(enabled = true, autoRefresh = false) {
  return useQuery({
    queryKey: ['dashboard-alerts', 30],
    queryFn: fetchDashboardAlerts,
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    ...live(autoRefresh),
  });
}

export function useDashboardInsights(start: string, end: string, enabled = true) {
  return useQuery({
    queryKey: ['dashboard-insights', start, end],
    queryFn: () => api.reports.insights(start, end),
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    ...live(true),
  });
}

export function useAdminDashboard(enabled = true) {
  return useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.admin.dashboard(),
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
