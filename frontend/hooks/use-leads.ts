import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast, toastMutationError } from '@/lib/toast';
import type { Lead } from '@/lib/types';

export function useLeads(params?: Record<string, string | number | boolean | undefined>) {
  return useQuery({
    queryKey: ['leads', params],
    queryFn: () => api.leads.list(params),
  });
}

export function useLead(id: number) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: () => api.leads.get(id),
    enabled: !!id,
  });
}

export function useLeadStatuses() {
  return useQuery({
    queryKey: ['lead-statuses'],
    queryFn: () => api.leads.statuses(),
  });
}

export function useLeadDashboard(start?: string, end?: string) {
  return useQuery({
    queryKey: ['lead-dashboard', start, end],
    queryFn: () => api.leads.dashboard(start, end),
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Lead> & { force_duplicate?: boolean }) => api.leads.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead created');
    },
    onError: (e) => toastMutationError(e),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => api.leads.update(id, data),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leads', v.id] });
      toast.success('Lead updated');
    },
    onError: (e) => toastMutationError(e),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.leads.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead deleted');
    },
    onError: (e) => toastMutationError(e),
  });
}
