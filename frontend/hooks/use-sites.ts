import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast, toastMutationError } from '@/lib/toast';
import type { Site } from '@/lib/types';

export function useSites() {
  return useQuery({
    queryKey: ['sites'],
    queryFn: () => api.sites.list(),
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

export function useDeleteSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.sites.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.refetchQueries({ queryKey: ['sites'] });
      toast.success('Site deleted');
    },
    onError: (err) => toastMutationError(err),
  });
}
