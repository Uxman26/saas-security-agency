'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { invoiceLabel } from '@/lib/invoice-utils';
import type { Invoice } from '@/lib/types';

export type ReminderTarget = Pick<Invoice, 'id' | 'invoice_number'>;

type Preview = { recipient: string | null; subject: string; body: string; balance: number; currency: string };

/** Shows the payment reminder exactly as the client will get it, then sends it. */
export function ReminderPreviewDialog({ invoice, onClose }: { invoice: ReminderTarget | null; onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setPreview(null);
    setError(null);
    setTo('');
    if (!invoice) return;
    let cancelled = false;
    api.invoices
      .reminderPreview(invoice.id)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setTo(p.recipient || '');
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the reminder');
      });
    return () => {
      cancelled = true;
    };
  }, [invoice]);

  const address = to.trim();
  const validAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);

  const send = async () => {
    if (!invoice || !preview || sending || !validAddress) return;
    setSending(true);
    try {
      const { message } = await api.invoices.sendReminder(invoice.id, address);
      toast.success(message);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the reminder');
    } finally {
      setSending(false);
    }
  };

  const amount = preview
    ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: preview.currency || 'GBP' }).format(preview.balance)
    : '';

  return (
    <Dialog open={!!invoice} onOpenChange={(open) => !open && !sending && onClose()}>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Send reminder</DialogTitle>
          <DialogDescription>
            Check the email below. Nothing is sent until you press Send reminder.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
            {error ?? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Loading preview…
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reminder-to">To</Label>
              <Input
                id="reminder-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="name@example.com"
              />
              {!preview.recipient ? (
                <p className="text-xs text-amber-700">This client has no email address on record. Enter one to send to.</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{preview.subject}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <iframe
                title="Reminder email preview"
                sandbox=""
                srcDoc={preview.body}
                className="h-[55vh] w-full rounded-md border bg-white"
              />
            </div>
            {invoice ? (
              <p className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
                Reminder for invoice <span className="font-semibold">{invoiceLabel(invoice)}</span> ({amount} outstanding)
                {validAddress ? (
                  <>
                    {' '}will be emailed to <span className="font-semibold break-all">{address}</span>.
                  </>
                ) : (
                  '. Enter a valid email address to send it.'
                )}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={!preview || sending || !validAddress}>
            <Send className="size-4" />
            {sending ? 'Sending…' : 'Send reminder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
