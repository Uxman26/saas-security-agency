import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast, toastMutationError } from '@/lib/toast';
import type { Assignment, Rota, WorkFilterParams } from '@/lib/types';

export function useAssignments(params?: { start_date?: string; end_date?: string } & WorkFilterParams) {
  return useQuery({
    queryKey: ['assignments', params],
    queryFn: () => api.assignments.list(params),
    refetchOnMount: true,
  });
}

export function useRota(params?: { start_date?: string; end_date?: string } & WorkFilterParams) {
  return useQuery({
    queryKey: ['rota', params],
    queryFn: () => api.assignments.rota(params),
    refetchOnMount: true,
  });
}

/** A date window plus the six shared work filters (client, site, contractor, …). */
export type RotaFilterParams = {
  start_date: string;
  end_date: string;
} & WorkFilterParams;

export function useRotaDetail(params: RotaFilterParams) {
  return useQuery({
    queryKey: ['rotaDetail', params],
    queryFn: () => api.assignments.rotaDetail(params),
    enabled: Boolean(params.start_date && params.end_date),
    refetchOnMount: true,
  });
}

export function useRotaSummary(params: RotaFilterParams) {
  return useQuery({
    queryKey: ['rotaSummary', params],
    queryFn: () => api.assignments.rotaSummary(params),
    enabled: Boolean(params.start_date && params.end_date),
    refetchOnMount: true,
  });
}

function invalidateRotaQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['assignments'] });
  qc.invalidateQueries({ queryKey: ['rota'] });
  qc.invalidateQueries({ queryKey: ['rotaDetail'] });
  qc.invalidateQueries({ queryKey: ['rotaSummary'] });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Assignment, 'id' | 'created_at'>) => api.assignments.create(data),
    onSuccess: () => {
      invalidateRotaQueries(queryClient);
      toast.success('Assignment created');
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Omit<Assignment, 'id' | 'created_at'>> }) =>
      api.assignments.update(id, data),
    onSuccess: () => {
      invalidateRotaQueries(queryClient);
      toast.success('Assignment updated');
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.assignments.delete(id),
    onSuccess: () => {
      invalidateRotaQueries(queryClient);
      toast.success('Assignment deleted');
    },
    onError: (err) => toastMutationError(err),
  });
}
