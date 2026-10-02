'use client';

import { ControlOpsAssistant } from '@/components/assistant/controlops-assistant';
import { canModule } from '@/lib/permissions';
import { useAuth } from '@/contexts/auth-context';
import { useTranslations } from 'next-intl';

export function RotaAiPanel() {
  const { user } = useAuth();
  const t = useTranslations('app');
  if (!canModule(user, 'rota', 'view')) return null;
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <ControlOpsAssistant
        embedded
        defaultOpen
        title={t('assistantTitle')}
        className="shadow-none border-0 rounded-none min-h-[380px] max-h-[420px]"
      />
    </div>
  );
}
