import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast, toastMutationError } from '@/lib/toast';
import type { Guard, RecordView } from '@/lib/types';

/** Live staff by default; pass view 'archived' or 'all' for the Archived tab. */
export function useGuards(params?: { area?: string; postcode?: string; nearby?: string; view?: RecordView }) {
  return useQuery({
    queryKey: [
      'guards',
      params?.area ?? '',
      params?.postcode ?? '',
      params?.nearby ?? '',
      params?.view ?? 'active',
    ],
    queryFn: () => api.guards.list(params),
    refetchOnMount: true,
  });
}

export function useGuard(id: number) {
  return useQuery({
    queryKey: ['guards', id],
    queryFn: () => api.guards.get(id),
    enabled: !!id,
  });
}

export function useCreateGuard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Guard, 'id' | 'company_id' | 'created_at'>) => api.guards.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guards'] });
      queryClient.refetchQueries({ queryKey: ['guards'] });
      toast.success('Staff member created');
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useUpdateGuard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Omit<Guard, 'id' | 'company_id' | 'created_at'>> }) =>
      api.guards.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['guards'] });
      queryClient.invalidateQueries({ queryKey: ['guards', variables.id] });
      toast.success('Staff member updated');
    },
    onError: (err) => toastMutationError(err),
  });
}

/** Archives by default; pass `permanent` to destroy the record and its history. */
export function useDeleteGuard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permanent }: { id: number; permanent?: boolean }) =>
      api.guards.delete(id, { permanent }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['guards'] });
      queryClient.refetchQueries({ queryKey: ['guards'] });
      toast.success(variables.permanent ? 'Staff member permanently deleted' : 'Staff member archived');
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useRestoreGuard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.guards.restore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guards'] });
      queryClient.refetchQueries({ queryKey: ['guards'] });
      toast.success('Staff member restored');
    },
    onError: (err) => toastMutationError(err),
  });
}
