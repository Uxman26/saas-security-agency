import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDirectoryContractorsList(params?: { type?: 'main' | 'sub'; is_active?: boolean }) {
  return useQuery({
    queryKey: ['directoryContractors', params?.type ?? 'all', params?.is_active ?? 'all'],
    queryFn: () => api.directoryContractors.getContractors(params),
  });
}
