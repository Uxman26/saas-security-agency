'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, AlertTriangle, Check, CheckCheck, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/auth-context';
import { formatDateLocale } from '@/lib/date-format';
import { useCentralAlerts, isNotifUnread } from '@/components/lead-notifications-provider';
import { cn } from '@/lib/utils';
import { useLocale, useTranslations } from 'next-intl';

export function AlertsPanel() {
  const { user } = useAuth();
  const t = useTranslations('alerts');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const {
    complianceAlerts: alerts,
    contractAlerts: contracts,
    leadAlerts,
    unreadCount,
    badgeCount,
    soundMuted,
    setSoundMuted,
    markLeadRead,
    markAllLeadRead,
    markPanelOpened,
  } = useCentralAlerts();

  if (user?.role === 'super_admin') return null;

  const hasAny = leadAlerts.length > 0 || contracts.length > 0 || alerts.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) void markPanelOpened();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative transition-colors hover:bg-primary/10 hover:text-primary"
          title={t('title')}
        >
          <Bell className="size-4" />
          {badgeCount > 0 && (
            <span className="absolute -top-0.5 -end-0.5 size-4 rounded-full bg-destructive text-[10px] text-white flex items-center justify-center">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pe-8">
          <DialogTitle>{t('title')}</DialogTitle>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              title={soundMuted ? t('unmuteNotifications') : t('muteNotifications')}
              onClick={() => void setSoundMuted(!soundMuted)}
            >
              {soundMuted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
              {soundMuted ? t('unmuteNotifications') : t('muteNotifications')}
            </Button>
            {unreadCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground"
                onClick={() => void markAllLeadRead()}
              >
                <CheckCheck className="size-3.5" />
                {t('markAllRead')}
              </Button>
            )}
          </div>
        </DialogHeader>
        {!hasAny ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t('empty')}</p>
        ) : (
          <div className="space-y-4 text-sm">
            {leadAlerts.length > 0 && (
              <div>
                <p className="font-medium mb-2">{t('notifications', { count: leadAlerts.length })}</p>
                <ul className="space-y-1.5">
                  {leadAlerts.map((a) => {
                    const unread = isNotifUnread(a);
                    return (
                      <li
                        key={a.id}
                        className={cn(
                          'rounded-md border px-3 py-2.5 transition-colors',
                          unread
                            ? 'bg-muted/80 border-border font-medium shadow-sm'
                            : 'bg-transparent border-border/40 text-muted-foreground'
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              className={cn(
                                'text-left hover:underline w-full',
                                unread ? 'text-foreground font-semibold' : 'font-normal'
                              )}
                              onClick={() => {
                                if (unread) void markLeadRead(a.id);
                                setOpen(false);
                                window.location.href = a.entity_id ? `/leads/${a.entity_id}` : '/leads';
                              }}
                            >
                              {a.title}
                            </button>
                            {a.body ? (
                              <p
                                className={cn(
                                  'text-xs mt-0.5',
                                  unread ? 'text-foreground/70' : 'text-muted-foreground'
                                )}
                              >
                                {a.body}
                              </p>
                            ) : null}
                          </div>
                          {unread ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                              title={t('markRead')}
                              onClick={(e) => {
                                e.stopPropagation();
                                void markLeadRead(a.id);
                              }}
                            >
                              <Check className="size-3.5" />
                            </Button>
                          ) : (
                            <span className="text-[10px] uppercase tracking-wide shrink-0 pt-1 opacity-60">
                              {t('read')}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {contracts.length > 0 && (
              <div>
                <p className="font-medium flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="size-4 text-amber-600" />
                  {t('contracts', { count: contracts.length })}
                </p>
                <ul className="space-y-1.5">
                  {contracts.map((a) => (
                    <li key={a.client_id} className="rounded-md border px-3 py-2">
                      <Link href="/clients" className="font-medium hover:underline" onClick={() => setOpen(false)}>
                        {a.client_name}
                      </Link>
<span className="text-muted-foreground"> · {t('ends', { date: formatDateLocale(a.contract_end_date, locale) })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {alerts.length > 0 && (
              <div>
                <p className="font-medium flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="size-4 text-amber-600" />
                  {t('compliance', { count: alerts.length })}
                </p>
                <ul className="space-y-1.5">
                  {alerts.map((a, i) => (
                    <li key={`${a.guard_id}-${a.document_type}-${i}`} className="rounded-md border px-3 py-2">
                      <span className="font-medium">{a.guard_name}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {a.document_type} · {formatDateLocale(a.expiry_date, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link href="/dashboard" onClick={() => setOpen(false)}>
            {t('viewDashboard')}
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
