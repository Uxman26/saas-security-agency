import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast, toastMutationError } from '@/lib/toast';
import type { Client, RecordView } from '@/lib/types';

/** Live clients by default; pass 'archived' or 'all' for the Archived tab. */
export function useClients(view: RecordView = 'active') {
  return useQuery({
    queryKey: ['clients', 'list', view],
    queryFn: () => api.clients.list({ view }),
    refetchOnMount: true,
  });
}

export function useClient(id: number) {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: () => api.clients.get(id),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Client, 'id' | 'company_id' | 'created_at'>) => api.clients.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.refetchQueries({ queryKey: ['clients'] });
      toast.success('Client created');
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Omit<Client, 'id' | 'company_id' | 'created_at'>> }) =>
      api.clients.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients', variables.id] });
      queryClient.refetchQueries({ queryKey: ['clients'] });
      toast.success('Client updated');
    },
    onError: (err) => toastMutationError(err),
  });
}

/** Archives by default; pass `permanent` to destroy the client and its invoices. */
export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permanent }: { id: number; permanent?: boolean }) =>
      api.clients.delete(id, { permanent }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.refetchQueries({ queryKey: ['clients'] });
      toast.success(variables.permanent ? 'Client permanently deleted' : 'Client archived');
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useRestoreClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.clients.restore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.refetchQueries({ queryKey: ['clients'] });
      toast.success('Client restored');
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useClientRenewals(clientId: number | null) {
  return useQuery({
    queryKey: ['clients', clientId, 'renewals'],
    queryFn: () => api.clients.renewals(clientId!),
    enabled: clientId != null && clientId > 0,
  });
}

export function useRenewClientContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { new_end_date: string; note?: string } }) =>
      api.clients.renew(id, data),
    onSuccess: (renewal) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients', renewal.client_id, 'renewals'] });
      queryClient.refetchQueries({ queryKey: ['clients'] });
      toast.success('Contract renewed');
    },
    onError: (err) => toastMutationError(err),
  });
}
