import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { MainContractor } from '@/lib/types';

export function useMainContractors() {
  return useQuery({
    queryKey: ['mainContractors'],
    queryFn: () => api.mainContractors.list(),
    refetchOnMount: true,
  });
}

export function useCreateMainContractor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<MainContractor, 'id' | 'company_id' | 'created_at'>) => api.mainContractors.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mainContractors'] });
    },
  });
}

export function useUpdateMainContractor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Omit<MainContractor, 'id' | 'company_id' | 'created_at'>> }) =>
      api.mainContractors.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mainContractors'] });
    },
  });
}

export function useDeleteMainContractor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.mainContractors.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mainContractors'] });
    },
  });
}
