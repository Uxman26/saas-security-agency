import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast, toastMutationError } from '@/lib/toast';
import type { SubContractor } from '@/lib/types';

export function useSubContractors(mainContractorId?: number) {
  return useQuery({
    queryKey: ['subContractors', mainContractorId ?? 'all'],
    queryFn: () => api.subContractors.list(mainContractorId),
    refetchOnMount: true,
  });
}

export function useSubContractor(id: number) {
  return useQuery({
    queryKey: ['subContractors', id],
    queryFn: () => api.subContractors.get(id),
    enabled: !!id,
  });
}

export function useCreateSubContractor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<SubContractor, 'id' | 'company_id' | 'created_at'> & { main_contractor_id: number }) =>
      api.subContractors.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subContractors'] });
      queryClient.refetchQueries({ queryKey: ['subContractors'] });
      toast.success('Sub contractor created');
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useUpdateSubContractor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Omit<SubContractor, 'id' | 'company_id' | 'created_at'>> }) =>
      api.subContractors.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['subContractors'] });
      queryClient.invalidateQueries({ queryKey: ['subContractors', variables.id] });
      queryClient.refetchQueries({ queryKey: ['subContractors'] });
      toast.success('Sub contractor updated');
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useDeleteSubContractor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.subContractors.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subContractors'] });
      queryClient.refetchQueries({ queryKey: ['subContractors'] });
      toast.success('Sub contractor deleted');
    },
    onError: (err) => toastMutationError(err),
  });
}
