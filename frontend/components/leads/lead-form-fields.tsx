'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  LEAD_DESIGNATIONS,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  designationLabel,
  leadLabel,
  priorityLabel,
  type LeadFormState,
} from '@/lib/leads';

type Props = {
  form: LeadFormState;
  onChange: (form: LeadFormState) => void;
  statuses: { name: string }[];
  onBlurContact?: () => void;
  dupes?: { field: string; lead_id: number; title: string }[];
};

export function LeadFormFields({ form, onChange, statuses, onBlurContact, dupes }: Props) {
  const set = (patch: Partial<LeadFormState>) => onChange({ ...form, ...patch });

  return (
    <div className="grid gap-3 max-h-[70vh] overflow-y-auto pr-1">
      <div className="space-y-1">
        <Label>Organization / Company / Group *</Label>
        <Input value={form.organization} onChange={(e) => set({ organization: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Contact Person</Label>
          <Input value={form.contact_name} onChange={(e) => set({ contact_name: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Designation</Label>
          <Select value={form.designation || '__none'} onValueChange={(v) => set({ designation: v === '__none' ? '' : v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              {LEAD_DESIGNATIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {designationLabel(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Phone Number</Label>
          <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} onBlur={onBlurContact} />
        </div>
        <div className="space-y-1">
          <Label>Additional Phone</Label>
          <Input value={form.phone_secondary} onChange={(e) => set({ phone_secondary: e.target.value })} onBlur={onBlurContact} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} onBlur={onBlurContact} />
        </div>
        <div className="space-y-1">
          <Label>Additional Email</Label>
          <Input type="email" value={form.email_secondary} onChange={(e) => set({ email_secondary: e.target.value })} onBlur={onBlurContact} />
        </div>
      </div>
      {dupes && dupes.length > 0 ? (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-200">Possible duplicate</p>
          {dupes.map((d) => (
            <p key={`${d.field}-${d.lead_id}`} className="text-muted-foreground">
              {d.field}: {d.title} (#{d.lead_id})
            </p>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>City</Label>
          <Input value={form.city} onChange={(e) => set({ city: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Postcode</Label>
          <Input value={form.postcode} onChange={(e) => set({ postcode: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Source</Label>
          <Select value={form.source} onValueChange={(v) => set({ source: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {leadLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set({ status: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {leadLabel(s.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v) => set({ priority: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {priorityLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {form.status === 'follow_up' ? (
        <div className="space-y-1">
          <Label>Follow-up Date *</Label>
          <Input type="datetime-local" value={form.follow_up_date} onChange={(e) => set({ follow_up_date: e.target.value })} />
        </div>
      ) : null}
      {form.status === 'meeting' ? (
        <div className="space-y-1">
          <Label>Meeting Date *</Label>
          <Input type="datetime-local" value={form.meeting_date} onChange={(e) => set({ meeting_date: e.target.value })} />
        </div>
      ) : null}
      <div className="space-y-1">
        <Label>Value (£)</Label>
        <Input type="number" value={form.estimated_value} onChange={(e) => set({ estimated_value: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Comments / Notes</Label>
        <Textarea rows={3} value={form.comments} onChange={(e) => set({ comments: e.target.value })} />
      </div>
    </div>
  );
}
