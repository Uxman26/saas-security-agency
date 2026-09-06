import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast, toastMutationError } from '@/lib/toast';
import type { RecordView, Site } from '@/lib/types';

/** Live sites by default; pass 'archived' or 'all' for the Archived tab. */
export function useSites(view: RecordView = 'active') {
  return useQuery({
    queryKey: ['sites', 'list', view],
    queryFn: () => api.sites.list({ view }),
    refetchOnMount: true,
  });
}

export function useSite(id: number) {
  return useQuery({
    queryKey: ['sites', id],
    queryFn: () => api.sites.get(id),
    enabled: !!id,
  });
}

export function useCreateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Site, 'id' | 'company_id' | 'created_at'>) => api.sites.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.refetchQueries({ queryKey: ['sites'] });
      toast.success('Site created');
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useUpdateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Omit<Site, 'id' | 'company_id' | 'created_at'>> }) =>
      api.sites.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['sites', variables.id] });
      toast.success('Site updated');
    },
    onError: (err) => toastMutationError(err),
  });
}

/** Archives by default; pass `permanent` to destroy the record. */
export function useDeleteSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permanent }: { id: number; permanent?: boolean }) =>
      api.sites.delete(id, { permanent }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.refetchQueries({ queryKey: ['sites'] });
      toast.success(variables.permanent ? 'Site permanently deleted' : 'Site archived');
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useRestoreSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.sites.restore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.refetchQueries({ queryKey: ['sites'] });
      toast.success('Site restored');
    },
    onError: (err) => toastMutationError(err),
  });
}
