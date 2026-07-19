'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/auth-context';
import { formatDateUK } from '@/lib/date-format';
import { useCentralAlerts } from '@/components/lead-notifications-provider';

export function AlertsPanel() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const {
    complianceAlerts: alerts,
    contractAlerts: contracts,
    leadAlerts,
    refreshAlerts,
    markLeadRead,
  } = useCentralAlerts();

  if (user?.role === 'super_admin') return null;

  const count = alerts.length + contracts.length + leadAlerts.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) void refreshAlerts();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative transition-colors hover:bg-primary/10 hover:text-primary" title="Alerts & messages">
          <Bell className="size-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-destructive text-[10px] text-white flex items-center justify-center">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Alerts & messages</DialogTitle>
        </DialogHeader>
        {count === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No alerts right now.</p>
        ) : (
          <div className="space-y-4 text-sm">
            {leadAlerts.length > 0 && (
              <div>
                <p className="font-medium mb-2">Lead alerts ({leadAlerts.length})</p>
                <ul className="space-y-1.5">
                  {leadAlerts.map((a) => (
                    <li key={a.id} className="rounded-md border px-3 py-2">
                      <button
                        type="button"
                        className="font-medium hover:underline text-left"
                        onClick={() => {
                          void markLeadRead(a.id);
                          setOpen(false);
                          window.location.href = a.entity_id ? `/leads/${a.entity_id}` : '/leads';
                        }}
                      >
                        {a.title}
                      </button>
                      {a.body ? <p className="text-xs text-muted-foreground mt-0.5">{a.body}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {contracts.length > 0 && (
              <div>
                <p className="font-medium flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="size-4 text-amber-600" />
                  Contracts expiring ({contracts.length})
                </p>
                <ul className="space-y-1.5">
                  {contracts.map((a) => (
                    <li key={a.client_id} className="rounded-md border px-3 py-2">
                      <Link href="/clients" className="font-medium hover:underline" onClick={() => setOpen(false)}>
                        {a.client_name}
                      </Link>
                      <span className="text-muted-foreground"> · ends {formatDateUK(a.contract_end_date)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {alerts.length > 0 && (
              <div>
                <p className="font-medium flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="size-4 text-amber-600" />
                  Compliance ({alerts.length})
                </p>
                <ul className="space-y-1.5">
                  {alerts.map((a, i) => (
                    <li key={`${a.guard_id}-${a.document_type}-${i}`} className="rounded-md border px-3 py-2">
                      <span className="font-medium">{a.guard_name}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {a.document_type} · {formatDateUK(a.expiry_date)}
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
            View dashboard
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
