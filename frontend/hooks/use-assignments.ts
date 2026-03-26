import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Assignment, Rota } from '@/lib/types';

export function useAssignments(params?: { guard_id?: number; site_id?: number; start_date?: string; end_date?: string }) {
  return useQuery({
    queryKey: ['assignments', params],
    queryFn: () => api.assignments.list(params),
    refetchOnMount: true,
  });
}

export function useRota(params?: { start_date?: string; end_date?: string }) {
  return useQuery({
    queryKey: ['rota', params],
    queryFn: () => api.assignments.rota(params),
    refetchOnMount: true,
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Assignment, 'id' | 'created_at'>) => api.assignments.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['rota'] });
      queryClient.refetchQueries({ queryKey: ['assignments'] });
      queryClient.refetchQueries({ queryKey: ['rota'] });
    },
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Omit<Assignment, 'id' | 'created_at'>> }) =>
      api.assignments.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['rota'] });
    },
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.assignments.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['rota'] });
      queryClient.refetchQueries({ queryKey: ['assignments'] });
      queryClient.refetchQueries({ queryKey: ['rota'] });
    },
  });
}
