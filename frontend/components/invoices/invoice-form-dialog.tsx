'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Building2,
  Calculator,
  CalendarDays,
  ClipboardCheck,
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
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { localDateKey } from '@/lib/date-format';
import { syncPaymentTermsNote } from '@/lib/invoice-utils';
import { INVOICE_CURRENCIES, formatInvoiceMoney } from '@/lib/invoice-currency';
import type { Client, ClientBankAccount, Guard, Invoice, InvoiceLine, Site } from '@/lib/types';

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

export const lineAmount = (l: FormLine) => (parseFloat(l.hours) || 0) * (parseFloat(l.rate) || 0) + (l.allowance || 0);

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
        // Changing either time works the hours out; Hours can still be typed over.
        if ('shift_start' in patch || 'shift_end' in patch) {
          const h = hoursBetween(next.shift_start, next.shift_end);
          if (h != null) next.hours = String(h);
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId?: number | null;
  onSaved: (invoice: Invoice) => void;
}) {
  const isEdit = invoiceId != null;
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [banks, setBanks] = useState<ClientBankAccount[]>([]);

  const [original, setOriginal] = useState<Invoice | null>(null);
  const [billTo, setBillTo] = useState<BillTo>('client');
  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => localDateKey());
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [po, setPo] = useState('');
  const [taxRate, setTaxRate] = useState('20');
  const [currency, setCurrency] = useState('GBP');
  const [bankId, setBankId] = useState('');
  const [status, setStatus] = useState('draft');
  const [notes, setNotes] = useState('');
  const [rotaReview, setRotaReview] = useState('');
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);
  /** Signatures of existing lines as loaded, keyed by line id. */
  const originalSigs = useRef<Map<number, string>>(new Map());

  const reset = () => {
    setOriginal(null);
    setBillTo('client');
    setClientId('');
    setSiteId('');
    setInvoiceDate(localDateKey());
    setPeriodStart('');
    setPeriodEnd('');
    setDueDate('');
    setPo('');
    setTaxRate('20');
    setCurrency('GBP');
    setBankId('');
    setBanks([]);
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
        setTaxRate(String(inv.tax_rate ?? 0));
        setCurrency(inv.currency || 'GBP');
        setBankId(inv.client_bank_account_id != null ? String(inv.client_bank_account_id) : '');
        setStatus(inv.status);
        setNotes(inv.notes ?? '');
        setRotaReview(inv.rota_review ?? '');
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

  // A new invoice picks the client's default account; an existing one keeps its own.
  useEffect(() => {
    if (!bankClientId) {
      setBanks([]);
      if (!isEdit) setBankId('');
      return;
    }
    api.clients
      .bankAccounts(parseInt(bankClientId, 10))
      .then((rows) => {
        setBanks(rows);
        if (!isEdit) {
          const def = rows.find((r) => r.is_default) ?? rows[0];
          setBankId(def ? String(def.id) : '');
        }
      })
      .catch(() => setBanks([]));
  }, [bankClientId, isEdit]);

  const clientOptions = useMemo(() => clients.map((c) => ({ value: String(c.id), label: c.name })), [clients]);
  const siteBillOptions = useMemo(() => billToSiteOptions(sites, clients), [sites, clients]);
  const lineSites = useMemo(() => lineSiteOptions(sites, clients, clientId), [sites, clients, clientId]);
  const guardOptions = useMemo(() => guards.map((g) => ({ value: String(g.id), label: g.full_name })), [guards]);

  const forcedSite = billTo === 'site' ? siteId : undefined;
  const subtotal = lines.reduce((sum, l) => sum + (isBlankLine(l) ? 0 : lineAmount(l)), 0);
  const tax = subtotal * ((parseFloat(taxRate) || 0) / 100);
  const money = (n: number) => formatInvoiceMoney(n, currency);

  const changeInvoiceDate = (v: string) => {
    setInvoiceDate(v);
    if (isEdit) setNotes((n) => syncPaymentTermsNote(n, v, dueDate));
  };
  const changeDueDate = (v: string) => {
    setDueDate(v);
    if (isEdit) setNotes((n) => syncPaymentTermsNote(n, invoiceDate, v));
  };

  const close = (o: boolean) => {
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
      period_start: periodStart,
      period_end: periodEnd,
      invoice_date: invoiceDate || undefined,
      due_date: dueDate || undefined,
      po_number: po.trim() || undefined,
      notes: notes.trim() || undefined,
      rota_review: rotaReview.trim() || undefined,
      client_bank_account_id: bankId ? parseInt(bankId, 10) : undefined,
      tax_rate: parseFloat(taxRate) || 0,
      currency,
      lines: chosen.map((l) => linePayload(l, forcedSite)),
    });
    toast.success(`Invoice #${inv.id} created`);
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
      period_start: periodStart,
      period_end: periodEnd,
      po_number: po.trim() || null,
      notes: notes || null,
      rota_review: rotaReview || null,
      tax_rate: parseFloat(taxRate) || 0,
      status,
      client_bank_account_id: bankId ? parseInt(bankId, 10) : null,
    });
    for (const lid of removed) await api.invoices.deleteLine(id, lid);
    for (const l of changed) {
      const p = linePayload(l, forcedSite);
      await api.invoices.updateLine(id, l.id as number, p);
    }
    for (const l of added) await api.invoices.addLine(id, addLinePayload(l, forcedSite));
    const inv = await api.invoices.get(id);
    toast.success(`Invoice #${id} saved`);
    return inv;
  };

  const submit = async () => {
    if (!periodStart || !periodEnd) return;
    if (periodStart > periodEnd) {
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
    !!periodStart &&
    !!periodEnd &&
    periodStart <= periodEnd &&
    (isEdit ? !!original : (billTo === 'client' ? !!clientId : !!siteId) && lines.some((l) => !isBlankLine(l)));

  const title = isEdit ? `Edit Invoice #${invoiceId}` : 'Create Custom Invoice';

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
              <div className="space-y-2 sm:pl-4">
                <InvoiceFieldLabel icon={CalendarDays}>Invoice date</InvoiceFieldLabel>
                <Input type="date" value={invoiceDate} onChange={(e) => changeInvoiceDate(e.target.value)} />
              </div>
            </InvoiceFormCard>

            {/* Period & due date */}
            <InvoiceFormCard className="grid gap-4 sm:grid-cols-[1fr_1fr_1.6fr]">
              <div className="space-y-1.5">
                <InvoiceFieldLabel icon={CalendarDays} required>Period start</InvoiceFieldLabel>
                <Input type="date" value={periodStart} max={periodEnd || undefined} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <InvoiceFieldLabel icon={CalendarDays} required>Period end</InvoiceFieldLabel>
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
                <Select value={bankId || 'none'} onValueChange={(v) => setBankId(v === 'none' ? '' : v)} disabled={!bankClientId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Company default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Company default</SelectItem>
                    {banks.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.label}
                        {b.is_default ? ' (Default)' : ''}
                        {b.bank_name ? ` · ${b.bank_name}` : ''}
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

            <Button className="w-full h-11 text-base shadow-sm" onClick={() => void submit()} disabled={!canSubmit}>
              <Send className="size-4 mr-2" />
              {saving ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save Invoice' : 'Create Invoice'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
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
