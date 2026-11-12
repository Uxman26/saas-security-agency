'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Printer, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';
import { downloadBlob } from '@/lib/download-blob';
import { cn } from '@/lib/utils';

export type SendDocumentRequest = {
  title: string;
  description: string;
  /** Prefilled address. Left blank, the server uses whatever it has on record. */
  email?: string | null;
  send: (to: string) => Promise<{ message: string }>;
  /** When given, the document is previewed in the dialog and can be downloaded or printed too. */
  pdf?: { load: () => Promise<Blob>; filename: string };
};

/** Shows a receipt or remittance, then emails, downloads or prints it. */
export function SendDocumentDialog({
  request,
  onClose,
}: {
  request: SendDocumentRequest | null;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (request) setEmail(request.email?.trim() || '');
  }, [request]);

  useEffect(() => {
    setPdfBlob(null);
    setPdfUrl(null);
    setPdfError(null);
    if (!request?.pdf) return;
    let cancelled = false;
    let url: string | null = null;
    request.pdf
      .load()
      .then((raw) => {
        if (cancelled) return;
        const blob = raw.type === 'application/pdf' ? raw : new Blob([raw], { type: 'application/pdf' });
        url = URL.createObjectURL(blob);
        setPdfBlob(blob);
        setPdfUrl(url);
      })
      .catch((e) => {
        if (!cancelled) setPdfError(e instanceof Error ? e.message : 'Could not load the document');
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
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

  const download = () => {
    if (pdfBlob && request?.pdf) downloadBlob(pdfBlob, request.pdf.filename);
  };

  const print = () => {
    if (!pdfUrl) return;
    try {
      const win = frameRef.current?.contentWindow;
      if (!win) throw new Error('no frame');
      win.focus();
      win.print();
    } catch {
      // Some browsers block printing an embedded PDF; open it in a tab to print from there.
      window.open(pdfUrl, '_blank', 'noopener');
    }
  };

  const hasPdf = !!request?.pdf;

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && !sending && onClose()}>
      <DialogContent className={cn(hasPdf ? 'sm:max-w-3xl' : 'sm:max-w-md')}>
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription>{request?.description}</DialogDescription>
        </DialogHeader>
        {hasPdf ? (
          <div className="h-[60vh] overflow-hidden rounded-md border bg-muted/30">
            {pdfUrl ? (
              <iframe ref={frameRef} src={pdfUrl} title={request?.title} className="size-full" />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                {pdfError ? (
                  pdfError
                ) : (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Loading preview…
                  </>
                )}
              </div>
            )}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="send-document-email">Send by email to</Label>
          <Input
            id="send-document-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="name@example.com"
          />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {hasPdf ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={download} disabled={!pdfBlob}>
                <Download className="size-4" /> Download
              </Button>
              <Button variant="outline" onClick={print} disabled={!pdfUrl}>
                <Printer className="size-4" /> Print
              </Button>
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={sending}>
              <Send className="size-4" />
              {sending ? 'Sending…' : 'Send email'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
