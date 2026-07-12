import type { Metadata } from 'next';
import { HelpShell, HelpHubGrid } from '@/components/help/help-shell';

export const metadata: Metadata = {
  title: { absolute: 'Help Centre | ControlOps' },
  description:
    'Guides for ControlOps: getting started, rotas, payroll, invoicing, settings, FAQ, and how to contact support.',
};

export default function HelpPage() {
  return (
    <HelpShell>
      <HelpHubGrid />
    </HelpShell>
  );
}
