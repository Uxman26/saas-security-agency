'use client';

import { RotaShiftsProvider } from '@/contexts/rota-shifts-context';

export default function RotaLayout({ children }: { children: React.ReactNode }) {
  return <RotaShiftsProvider>{children}</RotaShiftsProvider>;
}
