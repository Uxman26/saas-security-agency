'use client';

/**
 * Employee Profile → Emergencies.
 *
 * An employee with no emergency contact is the case this screen exists to fix, so the
 * empty state says so plainly rather than showing a blank panel. The first contact added
 * becomes the primary one automatically — there is no useful state where contacts exist
 * but none is the one to ring first.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { EmergencyContact } from '@/lib/types';

const FIELDS: { key: keyof EmergencyContact; label: string; type?: string }[] = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'relationship_to_employee', label: 'Relationship' },
  { key: 'mobile_phone', label: 'Mobile phone' },
  { key: 'home_phone', label: 'Home phone' },
  { key: 'work_phone', label: 'Work phone' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'address_line_1', label: 'Address' },
  { key: 'town_city', label: 'Town / city' },
  { key: 'postcode', label: 'Postcode' },
];

export function EmergenciesTab({ guardId, canEdit }: { guardId: number; canEdit: boolean }) {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmergencyContact | 'new' | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.guards
      .emergencyContacts(guardId)
      .then(setContacts)
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }, [guardId]);

  useEffect(() => {
    load();
  }, [load]);

  const open = (c: EmergencyContact | 'new') => {
    const next: Record<string, string> = {};
    for (const f of FIELDS) {
      next[f.key as string] = c === 'new' ? '' : ((c[f.key] as string | null) ?? '');
    }
    setValues(next);
    setEditing(c);
  };

  const save = async () => {
    if (!editing) return;
    if (!values.first_name?.trim()) {
      toast.error('A first name is required');
      return;
    }
    setBusy(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()])
      );
      if (editing === 'new') {
        await api.guards.createEmergencyContact(guardId, payload as Partial<EmergencyContact>);
        toast.success('Emergency contact added');
      } else {
        await api.guards.updateEmergencyContact(guardId, editing.id, payload as Partial<EmergencyContact>);
        toast.success('Emergency contact updated');
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the contact');
    } finally {
      setBusy(false);
    }
  };

  const remove = (c: EmergencyContact) => {
    toast.confirm(
      `Remove ${c.first_name} ${c.last_name ?? ''}`.trim() + ' as an emergency contact?',
      async () => {
        try {
          await api.guards.deleteEmergencyContact(guardId, c.id);
          load();
          toast.success('Emergency contact removed');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Delete failed');
        }
      },
      { label: 'Remove' }
    );
  };

  const makePrimary = async (c: EmergencyContact) => {
    try {
      await api.guards.updateEmergencyContact(guardId, c.id, {
        first_name: c.first_name,
        is_primary: true,
      });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update');
    }
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading emergency contacts…
        </p>
      ) : contacts.length === 0 ? (
        <div className="rounded-md border bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
          Add at least one emergency contact in case something unexpected happens.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.relationship_to_employee || 'Relationship not specified'}
                    </p>
                  </div>
                  {c.is_primary ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <Star className="size-3" />
                      Primary
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1 text-sm">
                  {[
                    ['Mobile', c.mobile_phone],
                    ['Home', c.home_phone],
                    ['Work', c.work_phone],
                    ['Email', c.email],
                  ]
                    .filter(([, v]) => v)
                    .map(([label, v]) => (
                      <p key={label} className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="size-3.5 shrink-0" />
                        <span className="truncate">
                          {label}: <span className="text-foreground">{v}</span>
                        </span>
                      </p>
                    ))}
                  {[c.address_line_1, c.town_city, c.postcode].filter(Boolean).length ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {[c.address_line_1, c.town_city, c.postcode].filter(Boolean).join(', ')}
                    </p>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap gap-1 border-t pt-2">
                    <Button variant="ghost" size="sm" onClick={() => open(c)}>
                      <Pencil className="mr-1.5 size-3.5" />
                      Edit
                    </Button>
                    {!c.is_primary ? (
                      <Button variant="ghost" size="sm" onClick={() => void makePrimary(c)}>
                        <Star className="mr-1.5 size-3.5" />
                        Make primary
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-destructive hover:text-destructive"
                      onClick={() => remove(c)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canEdit ? (
        <Button onClick={() => open('new')}>
          <Plus className="mr-1.5 size-4" />
          Add new contact
        </Button>
      ) : null}

      <Dialog open={editing != null} onOpenChange={(v) => (!v && !busy ? setEditing(null) : undefined)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Add emergency contact' : 'Edit emergency contact'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={String(f.key)} className="space-y-1">
                <Label>
                  {f.label}
                  {f.key === 'first_name' ? <span className="text-destructive"> *</span> : null}
                </Label>
                <Input
                  type={f.type ?? 'text'}
                  value={values[f.key as string] ?? ''}
                  onChange={(e) => setValues((p) => ({ ...p, [f.key as string]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy || !values.first_name?.trim()}>
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Save contact
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
