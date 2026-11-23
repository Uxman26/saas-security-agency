'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Building2,
  Calculator,
  CalendarDays,
  ClipboardCheck,
  Eye,
  Clock,
  Cog,
  Coins,
  FilePlus2,
  FileText,
  Hash,
  Landmark,
  Layers,
  List,
  type LucideIcon,
  MapPin,
  Pencil,
  Percent,
  Plus,
  PoundSterling,
  Send,
  Tag,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DueDateField } from '@/components/invoices/due-date-field';
import { InvoiceDocument } from '@/components/invoices/invoice-document';
import { storageGet, storageSet } from '@/lib/safe-storage';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { localDateKey } from '@/lib/date-format';
import { invoiceLabel, syncPaymentTermsNote } from '@/lib/invoice-utils';
import { INVOICE_CURRENCIES, formatInvoiceMoney } from '@/lib/invoice-currency';
import type { Client, ClientBankAccount, CompanyBankAccount, CompanyProfile, Guard, Invoice, InvoiceLine, Site } from '@/lib/types';

/**
 * Fills the invoice number with the next one in the chosen client's (or site's) own
 * sequence — XAEL007 after XAEL006. A number the user typed is left alone; one this hook
 * filled in is replaced when the customer changes. Returns the last number used.
 */
export function useNextInvoiceNumber({
  enabled,
  clientId,
  siteId,
  value,
  onChange,
}: {
  enabled: boolean;
  clientId?: string;
  siteId?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [last, setLast] = useState<string | null>(null);
  const suggested = useRef<string | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!enabled || (!clientId && !siteId)) return;
    let cancelled = false;
    api.invoices
      .nextNumber(siteId ? { site_id: parseInt(siteId, 10) } : { client_id: parseInt(clientId as string, 10) })
      .then(({ next_number, last_number }) => {
        if (cancelled) return;
        setLast(last_number);
        const current = valueRef.current.trim();
        // Only overwrite an empty box or our own earlier suggestion.
        if (!current || current === suggested.current) {
          suggested.current = next_number;
          onChangeRef.current(next_number ?? '');
        }
      })
      .catch(() => {
        if (!cancelled) setLast(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, clientId, siteId]);

  /** Forget the suggestion, e.g. when the form is reset. */
  const resetSuggestion = () => {
    suggested.current = null;
    setLast(null);
  };
  return { last: enabled && (clientId || siteId) ? last : null, resetSuggestion };
}

/** Hint under the invoice number box. */
export function invoiceNumberHint(last: string | null, hasCustomer: boolean): string | undefined {
  if (!hasCustomer) return undefined;
  return last ? `Last used: ${last}` : 'First invoice here: type a number (e.g. X-SAE-L-001) to start its sequence.';
}

const STATUSES = ['draft', 'sent', 'paid', 'partial', 'unpaid', 'overdue', 'cancelled'];

/** Who the invoice is raised against. */
export type BillTo = 'client' | 'site';

export type FormLine = {
  /** Stable React key; survives removal. */
  key: string;
  /** Server id for lines that already exist on the invoice (edit mode). */
  id?: number;
  site_id: string;
  guard_id: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  description: string;
  service_detail: string;
  quantity: string;
  hours: string;
  rate: string;
  /** Allowances come from rota-generated lines; kept as-is and added to the amount. */
  allowance: number;
  /** Shown when the line's site has since been deleted. */
  site_name?: string;
};

type Option = { value: string; label: string };

let keySeq = 0;
const nextKey = () => `l${++keySeq}`;

export const emptyLine = (): FormLine => ({
  key: nextKey(),
  site_id: '',
  guard_id: '',
  shift_date: '',
  shift_start: '',
  shift_end: '',
  description: '',
  service_detail: '',
  quantity: '1',
  hours: '0',
  rate: '0',
  allowance: 0,
});

const fromServerLine = (l: InvoiceLine): FormLine => ({
  key: nextKey(),
  id: l.id,
  site_id: l.site_id != null ? String(l.site_id) : '',
  guard_id: l.guard_id != null ? String(l.guard_id) : '',
  shift_date: (l.shift_date ?? '').slice(0, 10),
  shift_start: (l.shift_start ?? '').slice(0, 5),
  shift_end: (l.shift_end ?? '').slice(0, 5),
  description: l.description ?? '',
  service_detail: l.service_detail ?? '',
  quantity: String(l.quantity ?? 1),
  hours: String(l.hours ?? 0),
  rate: String(l.rate ?? 0),
  allowance: l.allowance_amount ?? 0,
  site_name: l.site_id == null ? (l.site_name ?? undefined) : undefined,
});

/** Hours between two HH:MM times; an end at or before the start runs past midnight. */
function hoursBetween(start: string, end: string): number | null {
  const m = (t: string) => {
    const [h, mm] = t.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(mm) ? h * 60 + mm : NaN;
  };
  const a = m(start);
  const b = m(end);
  if (!start || !end || Number.isNaN(a) || Number.isNaN(b)) return null;
  const mins = b > a ? b - a : b + 1440 - a;
  return Math.round((mins / 60) * 100) / 100;
}

/** Rounded to the penny per line, as the server stores it, so the form's totals match the invoice's. */
export const lineAmount = (l: FormLine) =>
  Math.round(((parseFloat(l.hours) || 0) * (parseFloat(l.rate) || 0) + (l.allowance || 0)) * 100) / 100;

/** Subtotal, tax and total worked out the way the server does (VAT rounded to the penny). */
export function invoiceTotals(lines: FormLine[], taxRate: string) {
  const subtotal = Math.round(lines.reduce((sum, l) => sum + (isBlankLine(l) ? 0 : lineAmount(l)), 0) * 100) / 100;
  const tax = Math.round(subtotal * (parseFloat(taxRate) || 0)) / 100;
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

/**
 * The bank account box holds "co:<id>" (one of the company's own accounts), "cl:<id>"
 * (an account on the client) or "" (the company default).
 */
const LAST_BANK_KEY = 'invoice:last-bank-account';
export const rememberBankChoice = (value: string) => {
  if (value) storageSet(LAST_BANK_KEY, value);
};
export const lastBankChoice = () => storageGet(LAST_BANK_KEY) || '';

/** API fields for the chosen account. */
export function bankPayload(value: string): { company_bank_account_id?: number; client_bank_account_id?: number | null } {
  const [kind, id] = value.split(':');
  if (kind === 'co' && id) return { company_bank_account_id: parseInt(id, 10) };
  if (kind === 'cl' && id) return { client_bank_account_id: parseInt(id, 10) };
  return { client_bank_account_id: null };
}

/** A line the user added but never filled in; dropped rather than saved. */
export const isBlankLine = (l: FormLine) =>
  !l.id &&
  !l.site_id &&
  !l.guard_id &&
  !l.description.trim() &&
  !l.service_detail.trim() &&
  !(parseFloat(l.hours) > 0) &&
  !(parseFloat(l.rate) > 0);

/** Fields compared to decide whether an existing line needs saving. */
const lineSignature = (l: FormLine) =>
  JSON.stringify([l.site_id, l.guard_id, l.shift_date, l.shift_start, l.shift_end, l.description, l.service_detail, l.quantity, l.hours, l.rate]);

/** API body for a line. `forcedSiteId` puts every line on the invoice's own site. */
export const linePayload = (l: FormLine, forcedSiteId?: string) => {
  const hours = parseFloat(l.hours) || 0;
  const rate = parseFloat(l.rate) || 0;
  const site = forcedSiteId || l.site_id;
  return {
    site_id: site ? parseInt(site, 10) : null,
    guard_id: l.guard_id ? parseInt(l.guard_id, 10) : null,
    shift_date: l.shift_date || null,
    shift_start: l.shift_start || null,
    shift_end: l.shift_end || null,
    description: l.description.trim() || null,
    service_detail: l.service_detail.trim() || null,
    quantity: parseFloat(l.quantity) || 1,
    hours,
    rate,
    allowance_amount: l.allowance || 0,
    amount: hours * rate + (l.allowance || 0),
  };
};

/** Same body, shaped for `api.invoices.addLine` (no nulls on ids). */
export const addLinePayload = (l: FormLine, forcedSiteId?: string) => {
  const p = linePayload(l, forcedSiteId);
  return { ...p, site_id: p.site_id ?? undefined, guard_id: p.guard_id ?? undefined } as Parameters<
    typeof api.invoices.addLine
  >[1];
};

/** Every site, labelled with its client, for picking the site an invoice is billed to. */
export function billToSiteOptions(sites: Site[], clients: Client[]): Option[] {
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  return [...sites]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      value: String(s.id),
      label: `${s.name} · ${s.client_id ? (clientName.get(s.client_id) ?? 'Client') : 'No client'}`,
    }));
}

/**
 * Sites a line on a client invoice may name: the client's own first, then sites with
 * no client. Sites of other clients are left out (the API rejects them). With no client
 * chosen yet, every site is offered.
 */
export function lineSiteOptions(sites: Site[], clients: Client[], clientId: string): Option[] {
  if (!clientId) return billToSiteOptions(sites, clients);
  const byName = (a: Site, b: Site) => a.name.localeCompare(b.name);
  const own = sites.filter((s) => s.client_id != null && String(s.client_id) === clientId).sort(byName);
  const unlinked = sites.filter((s) => s.client_id == null).sort(byName);
  return [
    ...own.map((s) => ({ value: String(s.id), label: s.name })),
    ...unlinked.map((s) => ({ value: String(s.id), label: `${s.name} (no client set)` })),
  ];
}

export const INVOICE_DIALOG_CONTENT_CLASS =
  // Width follows the screen (up to a comfortable maximum) instead of a fixed size;
  // height is the base dialog's viewport cap, so it only scrolls when it must.
  // Grid children get min-w-0 so date/time inputs can't push the form sideways.
  'w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[min(72rem,calc(100vw-4rem))] overflow-x-hidden overflow-y-auto p-0 gap-0 [&_.grid>*]:min-w-0 [&>[data-slot=dialog-close]]:top-4 [&>[data-slot=dialog-close]]:right-4 [&>[data-slot=dialog-close]]:z-20 [&>[data-slot=dialog-close]]:text-primary-foreground [&>[data-slot=dialog-close]]:opacity-90';

export const INVOICE_DIALOG_BODY_CLASS = 'space-y-3 p-4 sm:p-5 bg-muted/30';

/** Orange title bar shared by the invoice dialogs. Stays put while the body scrolls. */
export function InvoiceDialogHeader({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <DialogHeader className="sticky top-0 z-10 bg-primary text-primary-foreground px-5 py-3.5 text-left">
      <DialogTitle className="flex items-center gap-2.5 text-lg">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary-foreground/15">
          <Icon className="size-4.5" />
        </span>
        {title}
      </DialogTitle>
      <DialogDescription className="text-primary-foreground/85 text-xs">{description}</DialogDescription>
    </DialogHeader>
  );
}

/** Client / Site switch for who the invoice is raised against. */
export function BillToTabs({ value, onChange, disabled }: { value: BillTo; onChange: (v: BillTo) => void; disabled?: boolean }) {
  const tabs: { key: BillTo; label: string; icon: LucideIcon }[] = [
    { key: 'client', label: 'Client', icon: Users },
    { key: 'site', label: 'Site', icon: Building2 },
  ];
  return (
    <div role="tablist" aria-label="Invoice for" className="inline-flex rounded-lg border border-primary/30 bg-primary/5 p-0.5">
      {tabs.map(({ key, label, icon: Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled && !active}
            onClick={() => onChange(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors',
              active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              disabled && !active && 'cursor-not-allowed opacity-50 hover:text-muted-foreground'
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Editable line cards. With `showSite` off, lines carry no site picker: the invoice is
 * for one site and every line goes on it.
 */
export function LineItemsEditor({
  lines,
  onChange,
  showSite,
  siteOptions,
  guardOptions,
  money,
  title = 'Line items',
  hint,
  emptyText,
  allowEmpty = false,
}: {
  lines: FormLine[];
  onChange: (updater: (prev: FormLine[]) => FormLine[]) => void;
  showSite: boolean;
  siteOptions: Option[];
  guardOptions: Option[];
  money: (n: number) => string;
  title?: string;
  hint?: string;
  emptyText?: string;
  /** Allow removing the last line (for optional extra lines). */
  allowEmpty?: boolean;
}) {
  const setLine = (key: string, patch: Partial<FormLine>) =>
    onChange((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        const qtyOf = (q: string) => {
          const n = parseFloat(q);
          return Number.isFinite(n) && n > 0 ? n : 1;
        };
        // Changing either time works the hours out (times × quantity); Hours can still be typed over.
        if ('shift_start' in patch || 'shift_end' in patch) {
          const h = hoursBetween(next.shift_start, next.shift_end);
          if (h != null) next.hours = String(Math.round(h * qtyOf(next.quantity) * 100) / 100);
        }
        // Quantity scales the hours: 2 × a 12-hour shift is 24 hours. An empty box is
        // skipped so typing over the number does not reset the hours.
        if ('quantity' in patch && !('hours' in patch)) {
          const newQ = parseFloat(next.quantity);
          const hours = parseFloat(l.hours);
          if (Number.isFinite(newQ) && newQ > 0 && Number.isFinite(hours) && hours > 0) {
            const perUnit = hours / qtyOf(l.quantity);
            next.hours = String(Math.round(perUnit * newQ * 100) / 100);
          }
        }
        return next;
      })
    );

  const optionsFor = (siteId: string, siteName?: string): Option[] => {
    if (!siteId || siteOptions.some((o) => o.value === siteId)) return siteOptions;
    return [{ value: siteId, label: siteName || `Site #${siteId}` }, ...siteOptions];
  };

  return (
    <div className="overflow-hidden rounded-xl border border-primary/40 bg-background shadow-sm">
      <div className="flex items-center justify-between gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
        <span className="flex items-center gap-2 font-semibold">
          <Layers className="size-4.5" /> {title}
          <span className="rounded-full bg-primary-foreground/20 px-2 text-xs font-medium">{lines.length}</span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 border-primary-foreground/70 bg-transparent text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
          onClick={() => onChange((prev) => [...prev, emptyLine()])}
        >
          <Plus className="size-3.5 mr-1" /> Add line
        </Button>
      </div>
      <div className="space-y-3 p-3">
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        {lines.length === 0 && emptyText ? (
          <p className="rounded-lg border border-dashed border-primary/30 px-3 py-4 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : null}
        {lines.map((line, idx) => {
          const even = idx % 2 === 0;
          return (
            <div
              key={line.key}
              className={cn(
                'rounded-lg border p-3 space-y-3',
                even ? 'border-primary/30 bg-primary/[0.03]' : 'border-sky-500/30 bg-sky-500/[0.04]'
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    even ? 'bg-primary/15 text-primary' : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                  )}
                >
                  Line {idx + 1}
                </span>
                {allowEmpty || lines.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove line ${idx + 1}`}
                    onClick={() => onChange((prev) => prev.filter((l) => l.key !== line.key))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
              <div
                className={cn(
                  'grid grid-cols-2 gap-3',
                  showSite ? 'sm:grid-cols-[1.6fr_1.4fr_1.3fr_1fr_1fr]' : 'sm:grid-cols-[1.6fr_1.3fr_1fr_1fr]'
                )}
              >
                {showSite ? (
                  <div className="col-span-2 space-y-1.5 sm:col-span-1">
                    <InvoiceFieldLabel icon={MapPin}>Site</InvoiceFieldLabel>
                    <SearchableSelect
                      value={line.site_id}
                      onChange={(v) => setLine(line.key, { site_id: v })}
                      options={optionsFor(line.site_id)}
                      noneOption={{ value: '', label: 'No site' }}
                      placeholder={line.site_name ? `${line.site_name} (deleted)` : 'No site'}
                      searchPlaceholder="Search sites…"
                      emptyText="No matching sites"
                    />
                  </div>
                ) : null}
                <div className="col-span-2 space-y-1.5 sm:col-span-1">
                  <InvoiceFieldLabel icon={UserRound}>Staff</InvoiceFieldLabel>
                  <SearchableSelect
                    value={line.guard_id}
                    onChange={(v) => setLine(line.key, { guard_id: v })}
                    options={guardOptions}
                    noneOption={{ value: '', label: '—' }}
                    placeholder="—"
                    searchPlaceholder="Search staff…"
                    emptyText="No matching staff"
                  />
                </div>
                <div className="col-span-2 space-y-1.5 sm:col-span-1">
                  <InvoiceFieldLabel icon={CalendarDays}>Shift date</InvoiceFieldLabel>
                  <Input type="date" value={line.shift_date} onChange={(e) => setLine(line.key, { shift_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <InvoiceFieldLabel icon={Clock}>Start</InvoiceFieldLabel>
                  <Input type="time" value={line.shift_start} onChange={(e) => setLine(line.key, { shift_start: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <InvoiceFieldLabel icon={Clock}>End</InvoiceFieldLabel>
                  <Input type="time" value={line.shift_end} onChange={(e) => setLine(line.key, { shift_end: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <InvoiceFieldLabel icon={List}>Description</InvoiceFieldLabel>
                  <Input
                    placeholder="Enter description…"
                    value={line.description}
                    onChange={(e) => setLine(line.key, { description: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <InvoiceFieldLabel icon={Cog}>Service detail</InvoiceFieldLabel>
                  <Input
                    placeholder="Enter service detail…"
                    value={line.service_detail}
                    onChange={(e) => setLine(line.key, { service_detail: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-[1fr_1fr_1fr_1.2fr]">
                <div className="space-y-1.5">
                  <InvoiceFieldLabel icon={Hash}>Qty</InvoiceFieldLabel>
                  <Input type="number" step="0.01" value={line.quantity} onChange={(e) => setLine(line.key, { quantity: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <InvoiceFieldLabel icon={Clock}>Hours</InvoiceFieldLabel>
                  <Input type="number" step="0.01" value={line.hours} onChange={(e) => setLine(line.key, { hours: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <InvoiceFieldLabel icon={Coins}>Rate</InvoiceFieldLabel>
                  <Input type="number" step="0.01" value={line.rate} onChange={(e) => setLine(line.key, { rate: e.target.value })} />
                </div>
                <div className="col-span-3 flex items-center gap-3 rounded-lg bg-primary/12 px-3 py-2 sm:col-span-1">
                  <Calculator className="size-5 shrink-0 text-primary" />
                  <div className="leading-tight">
                    <div className="text-xs font-medium text-muted-foreground">
                      Amount{line.allowance ? ` (incl. ${money(line.allowance)} allowance)` : ''}
                    </div>
                    <div className="text-lg font-bold tabular-nums">{money(lineAmount(line))}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TEXTAREA_CLASS =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * The one invoice form: "Create Custom Invoice" when `invoiceId` is null, and the
 * same layout pre-filled for editing when it is set. An invoice is raised against a
 * client or a single site; who it is for (and its currency) is fixed once it exists.
 */
export function InvoiceFormDialog({
  open,
  onOpenChange,
  invoiceId = null,
  onSaved,
  onDraftSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId?: number | null;
  onSaved: (invoice: Invoice) => void;
  /** A new invoice closed part-way through was kept as a draft. */
  onDraftSaved?: (invoice: Invoice) => void;
}) {
  const isEdit = invoiceId != null;
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [banks, setBanks] = useState<ClientBankAccount[]>([]);
  const [companyBanks, setCompanyBanks] = useState<CompanyBankAccount[]>([]);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  /** The bank choice as loaded, so saving an edit only re-points the account when it changed. */
  const loadedBank = useRef('');

  const [original, setOriginal] = useState<Invoice | null>(null);
  const [billTo, setBillTo] = useState<BillTo>('client');
  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => localDateKey());
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [po, setPo] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [taxRate, setTaxRate] = useState('20');
  const [currency, setCurrency] = useState('GBP');
  const [bankId, setBankId] = useState('');
  const [status, setStatus] = useState('draft');
  const [notes, setNotes] = useState('');
  const [rotaReview, setRotaReview] = useState('');
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);
  /** Signatures of existing lines as loaded, keyed by line id. */
  const originalSigs = useRef<Map<number, string>>(new Map());

  const { last: lastNumber, resetSuggestion } = useNextInvoiceNumber({
    enabled: open && !isEdit,
    clientId: billTo === 'client' ? clientId : undefined,
    siteId: billTo === 'site' ? siteId : undefined,
    value: invoiceNumber,
    onChange: setInvoiceNumber,
  });

  const reset = () => {
    resetSuggestion();
    setOriginal(null);
    setBillTo('client');
    setClientId('');
    setSiteId('');
    setInvoiceDate(localDateKey());
    setPeriodStart('');
    setPeriodEnd('');
    setDueDate('');
    setPo('');
    setInvoiceNumber('');
    setTaxRate('20');
    setCurrency('GBP');
    setBankId('');
    setBanks([]);
    loadedBank.current = '';
    setPreviewOpen(false);
    setStatus('draft');
    setNotes('');
    setRotaReview('');
    setLines([emptyLine()]);
    originalSigs.current = new Map();
  };

  // Reference data, fetched when the dialog opens.
  useEffect(() => {
    if (!open) return;
    api.sites.list().then(setSites).catch(() => {});
    api.guards.list().then(setGuards).catch(() => {});
    api.clients.list().then(setClients).catch(() => {});
    api.company.bankAccounts().then(setCompanyBanks).catch(() => setCompanyBanks([]));
    api.company.profile().then(setProfile).catch(() => setProfile(null));
  }, [open]);

  // Edit mode: load the invoice and fill the form.
  useEffect(() => {
    if (!open || invoiceId == null) return;
    let cancelled = false;
    setLoadingInvoice(true);
    api.invoices
      .get(invoiceId)
      .then((inv) => {
        if (cancelled) return;
        const formLines = (inv.lines ?? []).map(fromServerLine);
        setOriginal(inv);
        // An invoice with no client was raised for a site; its lines carry that site.
        if (inv.client_id == null) {
          setBillTo('site');
          setClientId('');
          setSiteId(formLines.find((l) => l.site_id)?.site_id ?? '');
        } else {
          setBillTo('client');
          setClientId(String(inv.client_id));
          setSiteId('');
        }
        setInvoiceDate((inv.invoice_date ?? '').slice(0, 10));
        setPeriodStart((inv.period_start ?? '').slice(0, 10));
        setPeriodEnd((inv.period_end ?? '').slice(0, 10));
        setDueDate((inv.due_date ?? '').slice(0, 10));
        setPo(inv.po_number ?? '');
        setInvoiceNumber(inv.invoice_number ?? '');
        setTaxRate(String(inv.tax_rate ?? 0));
        setCurrency(inv.currency || 'GBP');
        setBankId(inv.client_bank_account_id != null ? `cl:${inv.client_bank_account_id}` : '');
        setStatus(inv.status);
        setNotes(inv.notes ?? '');
        setRotaReview(inv.rota_review ?? '');
        loadedBank.current = inv.client_bank_account_id != null ? `cl:${inv.client_bank_account_id}` : '';
        originalSigs.current = new Map(formLines.map((l) => [l.id as number, lineSignature(l)]));
        setLines(formLines.length ? formLines : [emptyLine()]);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load invoice');
      })
      .finally(() => {
        if (!cancelled) setLoadingInvoice(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, invoiceId]);

  const selectedSite = useMemo(() => sites.find((s) => String(s.id) === siteId), [sites, siteId]);
  // The client whose bank accounts apply: the chosen client, or the billed site's client.
  const bankClientId =
    billTo === 'client' ? clientId : selectedSite?.client_id != null ? String(selectedSite.client_id) : '';

  // The client's own accounts (if the invoice has a client) sit beside the company's.
  useEffect(() => {
    if (!bankClientId) {
      setBanks([]);
      return;
    }
    api.clients
      .bankAccounts(parseInt(bankClientId, 10))
      .then(setBanks)
      .catch(() => setBanks([]));
  }, [bankClientId]);

  const bankOptions = useMemo(
    () => [
      ...companyBanks.map((b) => ({
        value: `co:${b.id}`,
        label: `${b.label}${b.bank_name ? ` · ${b.bank_name}` : ''}${b.account_number ? ` · ${b.account_number}` : ''}${b.is_default ? ' (Default)' : ''}`,
        account: b as CompanyBankAccount | ClientBankAccount,
      })),
      ...banks.map((b) => ({
        value: `cl:${b.id}`,
        label: `${b.label} (client)${b.bank_name ? ` · ${b.bank_name}` : ''}${b.account_number ? ` · ${b.account_number}` : ''}`,
        account: b as CompanyBankAccount | ClientBankAccount,
      })),
    ],
    [companyBanks, banks]
  );

  // A new invoice starts on the account used last time, else the client's default,
  // else the company's default. An existing invoice shows the account it pays into.
  useEffect(() => {
    if (!open || loadingInvoice) return;
    if (isEdit) {
      if (!original || bankId) return;
      const match = companyBanks.find(
        (b) =>
          (b.account_number || '') === (original.account_number || '') &&
          (b.sort_code || '') === (original.sort_code || '') &&
          !!(b.account_number || b.sort_code)
      );
      if (match) {
        setBankId(`co:${match.id}`);
        loadedBank.current = `co:${match.id}`;
      }
      return;
    }
    if (bankId && bankOptions.some((o) => o.value === bankId)) return;
    const last = lastBankChoice();
    const pick =
      (last && bankOptions.some((o) => o.value === last) ? last : '') ||
      (banks.find((b) => b.is_default) ? `cl:${banks.find((b) => b.is_default)!.id}` : '') ||
      (companyBanks.find((b) => b.is_default) ? `co:${companyBanks.find((b) => b.is_default)!.id}` : '') ||
      bankOptions[0]?.value ||
      '';
    if (pick !== bankId) setBankId(pick);
  }, [open, isEdit, loadingInvoice, original, bankOptions, banks, companyBanks, bankId]);

  const clientOptions = useMemo(() => clients.map((c) => ({ value: String(c.id), label: c.name })), [clients]);
  const siteBillOptions = useMemo(() => billToSiteOptions(sites, clients), [sites, clients]);
  const lineSites = useMemo(() => lineSiteOptions(sites, clients, clientId), [sites, clients, clientId]);
  const guardOptions = useMemo(() => guards.map((g) => ({ value: String(g.id), label: g.full_name })), [guards]);

  const forcedSite = billTo === 'site' ? siteId : undefined;
  const { subtotal, tax } = invoiceTotals(lines, taxRate);
  const money = (n: number) => formatInvoiceMoney(n, currency);

  const changeInvoiceDate = (v: string) => {
    setInvoiceDate(v);
    if (isEdit) setNotes((n) => syncPaymentTermsNote(n, v, dueDate));
  };
  const changeDueDate = (v: string) => {
    setDueDate(v);
    if (isEdit) setNotes((n) => syncPaymentTermsNote(n, invoiceDate, v));
  };

  /**
   * Closing a new invoice that already has a customer keeps it as a draft instead of
   * losing what was typed. Without a client or site there is nothing it could belong to.
   */
  const saveDraftOnClose = async () => {
    const target = billTo === 'client' ? clientId : siteId;
    if (isEdit || saving || !target) return;
    const chosen = lines.filter((l) => !isBlankLine(l));
    const touched =
      chosen.length > 0 || !!periodStart || !!periodEnd || !!po.trim() || !!notes.trim() || !!rotaReview.trim() || !!invoiceNumber.trim();
    if (!touched) return;
    if (periodStart && periodEnd && periodStart > periodEnd) {
      toast.error('Draft not saved: period start is after period end');
      return;
    }
    try {
      const inv = await api.invoices.create({
        ...(billTo === 'site' ? { site_id: parseInt(siteId, 10) } : { client_id: parseInt(clientId, 10) }),
        period_start: periodStart || undefined,
        period_end: periodEnd || undefined,
        invoice_date: invoiceDate || undefined,
        due_date: dueDate || undefined,
        invoice_number: invoiceNumber.trim() || undefined,
        po_number: po.trim() || undefined,
        notes: notes.trim() || undefined,
        rota_review: rotaReview.trim() || undefined,
        ...(bankId ? bankPayload(bankId) : {}),
        tax_rate: parseFloat(taxRate) || 0,
        currency,
        status: 'draft',
        lines: chosen.map((l) => linePayload(l, billTo === 'site' ? siteId : undefined)),
      });
      toast.success(`Invoice ${invoiceLabel(inv)} saved as a draft`);
      onDraftSaved?.(inv);
    } catch (err) {
      toast.error(err instanceof Error ? `Draft not saved: ${err.message}` : 'Draft not saved');
    }
  };

  const close = (o: boolean) => {
    if (!o) void saveDraftOnClose();
    onOpenChange(o);
    if (!o) reset();
  };

  const handleCreate = async () => {
    const chosen = lines.filter((l) => !isBlankLine(l));
    if (chosen.length === 0) {
      toast.error('Add at least one line');
      return;
    }
    const inv = await api.invoices.create({
      ...(billTo === 'site' ? { site_id: parseInt(siteId, 10) } : { client_id: parseInt(clientId, 10) }),
      period_start: periodStart || undefined,
      period_end: periodEnd || undefined,
      invoice_date: invoiceDate || undefined,
      due_date: dueDate || undefined,
      invoice_number: invoiceNumber.trim() || undefined,
      po_number: po.trim() || undefined,
      notes: notes.trim() || undefined,
      rota_review: rotaReview.trim() || undefined,
      ...(bankId ? bankPayload(bankId) : {}),
      tax_rate: parseFloat(taxRate) || 0,
      currency,
      lines: chosen.map((l) => linePayload(l, forcedSite)),
    });
    rememberBankChoice(bankId);
    toast.success(`Invoice ${invoiceLabel(inv)} created`);
    return inv;
  };

  const handleUpdate = async (id: number) => {
    const existing = lines.filter((l) => l.id != null);
    const added = lines.filter((l) => l.id == null && !isBlankLine(l));
    const changed = existing.filter((l) => originalSigs.current.get(l.id as number) !== lineSignature(l));
    const keptIds = new Set(existing.map((l) => l.id));
    const removed = [...originalSigs.current.keys()].filter((lid) => !keptIds.has(lid));

    await api.invoices.patch(id, {
      invoice_date: invoiceDate || null,
      due_date: dueDate || null,
      ...(periodStart ? { period_start: periodStart } : {}),
      ...(periodEnd ? { period_end: periodEnd } : {}),
      invoice_number: invoiceNumber.trim() || null,
      po_number: po.trim() || null,
      notes: notes || null,
      rota_review: rotaReview || null,
      tax_rate: parseFloat(taxRate) || 0,
      status,
      // Only re-point the account when it was changed here.
      ...(bankId !== loadedBank.current ? bankPayload(bankId) : {}),
    });
    rememberBankChoice(bankId);
    for (const lid of removed) await api.invoices.deleteLine(id, lid);
    for (const l of changed) {
      const p = linePayload(l, forcedSite);
      await api.invoices.updateLine(id, l.id as number, p);
    }
    for (const l of added) await api.invoices.addLine(id, addLinePayload(l, forcedSite));
    const inv = await api.invoices.get(id);
    toast.success(`Invoice ${invoiceLabel(inv)} saved`);
    return inv;
  };

  const submit = async () => {
    if (periodStart && periodEnd && periodStart > periodEnd) {
      toast.error('Period start cannot be after period end');
      return;
    }
    setSaving(true);
    try {
      const inv = isEdit ? await handleUpdate(invoiceId as number) : await handleCreate();
      if (!inv) return;
      onOpenChange(false);
      reset();
      onSaved(inv);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isEdit ? 'Save failed' : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    !saving &&
    !loadingInvoice &&
    !(periodStart && periodEnd && periodStart > periodEnd) &&
    (isEdit ? !!original : (billTo === 'client' ? !!clientId : !!siteId) && lines.some((l) => !isBlankLine(l)));

  const title = isEdit ? `Edit Invoice ${original ? invoiceLabel(original) : `#${invoiceId}`}` : 'Create Custom Invoice';

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={INVOICE_DIALOG_CONTENT_CLASS}>
        <InvoiceDialogHeader
          icon={isEdit ? Pencil : FilePlus2}
          title={title}
          description={
            isEdit ? 'Change the invoice details and its lines, then save.' : 'Raise an invoice for a client or a site with your own lines.'
          }
        />

        {isEdit && loadingInvoice ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading invoice…</div>
        ) : (
          <div className={INVOICE_DIALOG_BODY_CLASS}>
            {/* Who it's for & invoice date */}
            <InvoiceFormCard className="grid gap-4 sm:grid-cols-[1.4fr_1fr] sm:divide-x sm:divide-primary/15">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <InvoiceFieldLabel icon={billTo === 'client' ? Users : Building2} required={!isEdit}>
                    Invoice for
                  </InvoiceFieldLabel>
                  <BillToTabs
                    value={billTo}
                    disabled={isEdit}
                    onChange={(v) => {
                      setBillTo(v);
                      setClientId('');
                      setSiteId('');
                    }}
                  />
                </div>
                {isEdit ? (
                  <Input
                    disabled
                    value={
                      billTo === 'client'
                        ? original?.client_name || `Client #${original?.client_id}`
                        : selectedSite?.name || original?.client_name || 'Site'
                    }
                  />
                ) : billTo === 'client' ? (
                  <SearchableSelect
                    value={clientId}
                    options={clientOptions}
                    placeholder="Select client"
                    searchPlaceholder="Search clients…"
                    onChange={setClientId}
                  />
                ) : (
                  <SearchableSelect
                    value={siteId}
                    options={siteBillOptions}
                    placeholder="Select site"
                    searchPlaceholder="Search sites…"
                    emptyText="No matching sites"
                    onChange={setSiteId}
                  />
                )}
                {billTo === 'site' && selectedSite && selectedSite.client_id == null ? (
                  <p className="text-xs text-muted-foreground">This site has no client, so its name is shown as the customer.</p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:pl-4">
                <div className="space-y-2">
                  <InvoiceFieldLabel icon={Hash}>Invoice number</InvoiceFieldLabel>
                  <Input
                    placeholder={isEdit ? `#${invoiceId}` : 'e.g. X-SAE-L-001'}
                    maxLength={50}
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                  />
                  {!isEdit && invoiceNumberHint(lastNumber, billTo === 'client' ? !!clientId : !!siteId) ? (
                    <p className="text-xs text-muted-foreground">
                      {invoiceNumberHint(lastNumber, billTo === 'client' ? !!clientId : !!siteId)}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <InvoiceFieldLabel icon={CalendarDays}>Invoice date</InvoiceFieldLabel>
                  <Input type="date" value={invoiceDate} onChange={(e) => changeInvoiceDate(e.target.value)} />
                </div>
              </div>
            </InvoiceFormCard>

            {/* Period & due date */}
            <InvoiceFormCard className="grid gap-4 sm:grid-cols-[1fr_1fr_1.6fr]">
              <div className="space-y-1.5">
                <InvoiceFieldLabel icon={CalendarDays}>Period start</InvoiceFieldLabel>
                <Input type="date" value={periodStart} max={periodEnd || undefined} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <InvoiceFieldLabel icon={CalendarDays}>Period end</InvoiceFieldLabel>
                <Input type="date" value={periodEnd} min={periodStart || undefined} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <InvoiceFieldLabel icon={Clock}>Due date</InvoiceFieldLabel>
                <DueDateField invoiceDate={invoiceDate} value={dueDate} onChange={changeDueDate} />
              </div>
            </InvoiceFormCard>

            {/* Reference, tax, currency, bank, status */}
            <InvoiceFormCard className={cn('grid gap-4 grid-cols-2', isEdit ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
              <div className="space-y-1.5">
                <InvoiceFieldLabel icon={Tag}>PO number</InvoiceFieldLabel>
                <Input placeholder="Enter PO number" value={po} onChange={(e) => setPo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <InvoiceFieldLabel icon={Percent}>Tax rate (%)</InvoiceFieldLabel>
                <Input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <InvoiceFieldLabel icon={PoundSterling}>Currency</InvoiceFieldLabel>
                <CurrencySelect value={currency} onChange={setCurrency} disabled={isEdit} />
              </div>
              <div className="space-y-1.5">
                <InvoiceFieldLabel icon={Landmark}>Bank account</InvoiceFieldLabel>
                <Select value={bankId || 'none'} onValueChange={(v) => setBankId(v === 'none' ? '' : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Company default" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankOptions.length === 0 || !bankId ? <SelectItem value="none">Company default</SelectItem> : null}
                    {bankOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isEdit ? (
                <div className="space-y-1.5">
                  <InvoiceFieldLabel icon={Activity}>Status</InvoiceFieldLabel>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </InvoiceFormCard>

            <InvoiceFormCard title="Notes / terms" icon={FileText} bodyClassName="p-3">
              <textarea
                className={cn(TEXTAREA_CLASS, 'min-h-[64px]')}
                placeholder="Enter notes, terms or payment instructions…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </InvoiceFormCard>

            <InvoiceFormCard title="Rota review" icon={ClipboardCheck} bodyClassName="p-3">
              <textarea
                className={cn(TEXTAREA_CLASS, 'min-h-[56px]')}
                placeholder="Enter rota review or additional comments…"
                value={rotaReview}
                onChange={(e) => setRotaReview(e.target.value)}
              />
            </InvoiceFormCard>

            <LineItemsEditor
              lines={lines}
              onChange={setLines}
              showSite={billTo === 'client'}
              siteOptions={lineSites}
              guardOptions={guardOptions}
              money={money}
              hint={
                billTo === 'site'
                  ? `Every line goes on ${selectedSite?.name ?? 'the selected site'}.`
                  : 'Site is optional on each line.'
              }
            />

            <InvoiceTotals subtotal={subtotal} tax={tax} money={money} />

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="h-11 text-base shadow-sm sm:w-56"
                onClick={() => setPreviewOpen(true)}
                disabled={loadingInvoice || (isEdit ? !original : billTo === 'client' ? !clientId : !siteId)}
              >
                <Eye className="size-4 mr-2" />
                Preview Invoice
              </Button>
              <Button className="h-11 flex-1 text-base shadow-sm" onClick={() => void submit()} disabled={!canSubmit}>
                <Send className="size-4 mr-2" />
                {saving ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save Invoice' : 'Create Invoice'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className={INVOICE_DIALOG_CONTENT_CLASS}>
          <InvoiceDialogHeader icon={Eye} title="Invoice preview" description="How the invoice will look once saved. Nothing has been saved yet." />
          <div className="bg-muted/30 p-4 sm:p-6">
            {previewOpen ? (
              <InvoiceDocument
                printId="invoice-preview"
                invoice={buildPreviewInvoice({
                  original,
                  profile,
                  client:
                    billTo === 'client'
                      ? clients.find((c) => String(c.id) === clientId)
                      : selectedSite?.client_id != null
                        ? clients.find((c) => c.id === selectedSite.client_id)
                        : undefined,
                  site: billTo === 'site' ? selectedSite : undefined,
                  account: bankOptions.find((o) => o.value === bankId)?.account,
                  fields: {
                    invoice_number: invoiceNumber.trim() || null,
                    invoice_date: invoiceDate || null,
                    due_date: dueDate || null,
                    period_start: periodStart,
                    period_end: periodEnd,
                    po_number: po.trim() || null,
                    notes: notes.trim() || null,
                    rota_review: rotaReview.trim() || null,
                    tax_rate: parseFloat(taxRate) || 0,
                    currency,
                    status,
                  },
                  lines: lines.filter((l) => !isBlankLine(l)),
                  sites,
                  forcedSite,
                })}
              />
            ) : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                <Pencil className="size-4 mr-2" />
                Back to editing
              </Button>
              <Button
                onClick={() => {
                  setPreviewOpen(false);
                  void submit();
                }}
                disabled={!canSubmit}
              >
                <Send className="size-4 mr-2" />
                {isEdit ? 'Save Invoice' : 'Create Invoice'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

/**
 * An Invoice built from the unsaved form, shaped like the server's, for the preview.
 * Company details come from the saved invoice when editing, else the company profile.
 */
function buildPreviewInvoice({
  original,
  profile,
  client,
  site,
  account,
  fields,
  lines,
  sites,
  forcedSite,
}: {
  original: Invoice | null;
  profile: CompanyProfile | null;
  client?: Client;
  site?: Site;
  account?: CompanyBankAccount | ClientBankAccount;
  fields: {
    invoice_number: string | null;
    invoice_date: string | null;
    due_date: string | null;
    period_start: string;
    period_end: string;
    po_number: string | null;
    notes: string | null;
    rota_review: string | null;
    tax_rate: number;
    currency: string;
    status: string;
  };
  lines: FormLine[];
  sites: Site[];
  forcedSite?: string;
}): Invoice {
  const now = new Date().toISOString();
  const siteName = new Map(sites.map((s) => [String(s.id), s.name]));
  const previewLines: InvoiceLine[] = lines.map((l, i) => {
    const siteId = forcedSite || l.site_id;
    return {
      id: -(i + 1),
      invoice_id: original?.id ?? 0,
      site_id: siteId ? parseInt(siteId, 10) : (null as unknown as number),
      guard_id: l.guard_id ? parseInt(l.guard_id, 10) : undefined,
      shift_date: l.shift_date || null,
      shift_start: l.shift_start || null,
      shift_end: l.shift_end || null,
      description: l.description.trim() || null,
      service_detail: l.service_detail.trim() || null,
      quantity: parseFloat(l.quantity) || 1,
      hours: parseFloat(l.hours) || 0,
      rate: parseFloat(l.rate) || 0,
      amount: lineAmount(l),
      allowance_amount: l.allowance || 0,
      created_at: now,
      site_name: (siteId && siteName.get(siteId)) || l.site_name || null,
    };
  });
  const subtotal = Math.round(previewLines.reduce((n, l) => n + l.amount, 0) * 100) / 100;
  const tax = Math.round(subtotal * fields.tax_rate) / 100;
  const companyAddress = (() => {
    const a = (profile?.address || '').trim();
    const pc = (profile?.postcode || '').trim();
    if (pc && !a.replace(/\s/g, '').toUpperCase().includes(pc.replace(/\s/g, '').toUpperCase())) return a ? `${a}, ${pc}` : pc;
    return a;
  })();
  // Who it is billed to: the client, else the site standing in for one.
  const bill = original
    ? {
        client_name: original.client_name,
        client_email: original.client_email,
        client_phone: original.client_phone,
        client_address: original.client_address,
        client_town: original.client_town,
        client_postcode: original.client_postcode,
        client_contact_person: original.client_contact_person,
      }
    : client
      ? {
          client_name: client.name,
          client_email: client.email,
          client_phone: client.phone,
          client_address: client.address,
          client_town: client.town,
          client_postcode: client.postcode,
          client_contact_person: client.contact_person,
        }
      : {
          client_name: site?.name,
          client_email: site?.contact_email,
          client_phone: site?.contact_phone,
          client_address: site?.address,
          client_town: site?.town,
          client_postcode: site?.postcode,
          client_contact_person: site?.contact_person,
        };
  const bank = account
    ? account
    : original
      ? original
      : profile;
  return {
    id: original?.id ?? 0,
    company_id: original?.company_id ?? profile?.id ?? 0,
    client_id: original?.client_id ?? client?.id ?? null,
    period_start: fields.period_start,
    period_end: fields.period_end,
    invoice_date: fields.invoice_date,
    due_date: fields.due_date,
    invoice_number: fields.invoice_number ?? original?.invoice_number ?? 'Not numbered yet',
    po_number: fields.po_number,
    notes: fields.notes,
    rota_review: fields.rota_review,
    tax_rate: fields.tax_rate,
    subtotal,
    tax_amount: tax,
    total: Math.round((subtotal + tax) * 100) / 100,
    currency: fields.currency,
    status: original ? fields.status : 'draft',
    created_at: original?.created_at ?? now,
    company_name: original?.company_name ?? profile?.name,
    company_email: original?.company_email ?? profile?.email,
    company_phone: original?.company_phone ?? profile?.phone,
    company_address: original?.company_address ?? (companyAddress || null),
    company_website: original?.company_website ?? profile?.website,
    company_registration_number: original?.company_registration_number ?? profile?.registration_number,
    company_vat_number: original?.company_vat_number ?? profile?.vat_number,
    company_logo_url: original?.company_logo_url ?? profile?.logo_url,
    account_name: bank?.account_name,
    bank_name: bank?.bank_name,
    sort_code: bank?.sort_code,
    account_number: bank?.account_number,
    iban: bank?.iban,
    swift_code: bank?.swift_code,
    ...bill,
    lines: previewLines,
    amount_paid: original?.amount_paid ?? 0,
    credit_applied: original?.credit_applied ?? 0,
    column_headers: original?.column_headers ?? null,
  };
}

export function CurrencySelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {INVOICE_CURRENCIES.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {c.code} — {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function InvoiceTotals({ subtotal, tax, money, label }: { subtotal: number; tax: number; money: (n: number) => string; label?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-xl border border-primary/25 bg-background px-4 py-3 text-sm shadow-sm">
      {label ? <span className="mr-auto text-xs text-muted-foreground">{label}</span> : null}
      <span className="text-muted-foreground">
        Subtotal <span className="font-medium text-foreground tabular-nums">{money(subtotal)}</span>
      </span>
      <span className="text-muted-foreground">
        Tax <span className="font-medium text-foreground tabular-nums">{money(tax)}</span>
      </span>
      <span className="text-base font-semibold">
        Total <span className="text-primary tabular-nums">{money(subtotal + tax)}</span>
      </span>
    </div>
  );
}

/** Bordered section card used by the invoice dialogs. */
export function InvoiceFormCard({
  title,
  icon: Icon,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  icon?: LucideIcon;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  if (!title) {
    return <div className={cn('rounded-xl border border-primary/25 bg-background p-4 shadow-sm', className)}>{children}</div>;
  }
  return (
    <div className={cn('overflow-hidden rounded-xl border border-primary/25 bg-background shadow-sm', className)}>
      <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm font-semibold">
        {Icon ? <Icon className="size-4 text-primary" /> : null}
        {title}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

export function InvoiceFieldLabel({ icon: Icon, required, children }: { icon: LucideIcon; required?: boolean; children: React.ReactNode }) {
  return (
    <Label className="flex items-center gap-1.5 text-sm font-medium">
      <Icon className="size-3.5 text-primary" />
      {children}
      {required ? <span className="text-destructive">*</span> : null}
    </Label>
  );
}
