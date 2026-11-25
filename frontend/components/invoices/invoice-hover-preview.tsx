'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDateUK } from '@/lib/date-format';
import type { Invoice } from '@/lib/types';

const OPEN_DELAY_MS = 350;
const CARD_WIDTH = 600;

type Anchor = { invoice: Invoice; rect: DOMRect };

function day(raw: string | null | undefined): string {
  return raw ? formatDateUK(raw) || '—' : '—';
}

/**
 * Hover preview for an invoice list row: when it is due, last emailed and last paid,
 * who it is billed to, the PO number and notes. Opens after a short pause so moving
 * the mouse across the list does not flash a card over every row.
 */
export function useInvoiceHoverPreview() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const rowProps = useCallback(
    (invoice: Invoice) => ({
      onMouseEnter: (e: React.MouseEvent<HTMLTableRowElement>) => {
        clear();
        const row = e.currentTarget;
        timer.current = setTimeout(() => setAnchor({ invoice, rect: row.getBoundingClientRect() }), OPEN_DELAY_MS);
      },
      onMouseLeave: () => {
        clear();
        setAnchor(null);
      },
    }),
    []
  );

  // The card is placed from the row's position, so close it rather than leave it behind.
  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [anchor]);

  useEffect(() => clear, []);

  const preview = anchor ? <InvoiceHoverCard anchor={anchor} /> : null;
  return { rowProps, preview };
}

function InvoiceHoverCard({ anchor }: { anchor: Anchor }) {
  const { invoice: inv, rect } = anchor;
  if (typeof document === 'undefined') return null;

  const width = Math.min(CARD_WIDTH, window.innerWidth - 24);
  const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12));
  // Above the row, as in the list's design; below it when there is no room above.
  const above = rect.top > 300;
  const style: React.CSSProperties = above
    ? { left, width, bottom: window.innerHeight - rect.top + 8 }
    : { left, width, top: rect.bottom + 8 };

  const customer = [
    inv.bill_to_name || inv.client_name,
    inv.client_contact_person,
    inv.client_email,
    inv.client_phone,
  ].filter((v): v is string => !!v && !!String(v).trim());
  const bank = [
    inv.bank_name,
    inv.account_name,
    inv.sort_code ? `Sort code ${inv.sort_code}` : null,
    inv.account_number ? `Account ${inv.account_number}` : null,
  ]
    .filter((v) => !!v && !!String(v).trim())
    .join(' · ');
  const summary =
    inv.period_start && inv.period_end ? `Services ${day(inv.period_start)} – ${day(inv.period_end)}` : '—';

  return createPortal(
    <div
      role="tooltip"
      style={style}
      className="pointer-events-none fixed z-50 rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-xl"
    >
      <div className="grid grid-cols-3 gap-4 border-b pb-3">
        <Stat label="Due" value={inv.status === 'draft' ? '—' : day(inv.due_date)} />
        <Stat label="Last sent" value={inv.last_sent_at ? day(inv.last_sent_at) : 'Never'} />
        <Stat label="Last paid" value={day(inv.last_paid_at)} />
      </div>
      <dl className="mt-3 grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-right font-semibold">Customer:</dt>
        <dd className="space-y-0.5">
          {customer.length ? customer.map((c, i) => <div key={i} className="break-words">{c}</div>) : '—'}
        </dd>
        <dt className="text-right font-semibold">Summary:</dt>
        <dd>{summary}</dd>
        <dt className="text-right font-semibold">P.O./S.O. number:</dt>
        <dd>{inv.po_number?.trim() || '—'}</dd>
        <dt className="text-right font-semibold">Bank:</dt>
        <dd>{bank || 'No bank account on this invoice'}</dd>
        <dt className="text-right font-semibold">Notes / Terms:</dt>
        <dd className="line-clamp-4 whitespace-pre-line break-words">{inv.notes?.trim() || '—'}</dd>
      </dl>
    </div>,
    document.body
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums">{value}</div>
    </div>
  );
}
