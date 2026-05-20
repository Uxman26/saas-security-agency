import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Guard } from '@/lib/types';

export function useGuards(params?: { area?: string; postcode?: string; nearby?: string }) {
  return useQuery({
    queryKey: ['guards', params?.area ?? '', params?.postcode ?? '', params?.nearby ?? ''],
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
    },
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
    },
  });
}

export function useDeleteGuard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.guards.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guards'] });
      queryClient.refetchQueries({ queryKey: ['guards'] });
    },
  });
}
