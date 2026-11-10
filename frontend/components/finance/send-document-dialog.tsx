'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';

export type SendDocumentRequest = {
  title: string;
  description: string;
  /** Prefilled address. Left blank, the server uses whatever it has on record. */
  email?: string | null;
  send: (to: string) => Promise<{ message: string }>;
};

/** Confirms who a receipt or remittance is going to before it is emailed. */
export function SendDocumentDialog({
  request,
  onClose,
}: {
  request: SendDocumentRequest | null;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (request) setEmail(request.email?.trim() || '');
  }, [request]);

  const submit = async () => {
    if (!request || sending) return;
    setSending(true);
    try {
      const { message } = await request.send(email.trim());
      toast.success(message);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the email');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && !sending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription>{request?.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="send-document-email">Send to</Label>
          <Input
            id="send-document-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
