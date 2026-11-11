'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useModuleLabel } from '@/lib/module-i18n';
import { groupTenantNavSections, isNavPathActive } from '@/lib/sidebar-sections';

export function PageTitle() {
  const { user } = useAuth();
  const pathname = usePathname();
  const ts = useTranslations('sidebar');
  const t = useTranslations('dashboard.shell');
  const moduleLabel = useModuleLabel();
  const hit = groupTenantNavSections(user)
    .map((s) => ({ section: s.titleKey, m: s.items.find((x) => x.sidebar_path && isNavPathActive(pathname, x.sidebar_path)) }))
    .find((x) => x.m);
  if (!hit?.m) return null;
  return (
    <nav aria-label={t('breadcrumb')} className="hidden min-w-0 items-center gap-1.5 text-sm 2xl:flex">
      <span className="truncate text-muted-foreground">{ts(hit.section)}</span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 rtl:-scale-x-100" aria-hidden />
      <span className="truncate font-semibold text-foreground" aria-current="page">
        {moduleLabel(hit.m.key, hit.m.name)}
      </span>
    </nav>
  );
}
