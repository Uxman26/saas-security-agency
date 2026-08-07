import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Cached dashboard overview — avoids refetching on every visit. */
export function useDashboardOverview(enabled = true) {
  return useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.reports.dashboard(),
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useDashboardAlerts(enabled = true) {
  return useQuery({
    queryKey: ['dashboard-alerts', 30],
    queryFn: async () => {
      const [compliance, contracts] = await Promise.all([
        api.reports.compliance(30),
        api.reports.contractsExpiring(30),
      ]);
      return { compliance, contracts };
    },
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
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
