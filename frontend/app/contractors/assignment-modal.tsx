'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Input } from '@/components/ui/input';
import { TEXT_LIMITS } from '@/lib/text-limits';
import type { DirectoryContractorList, Site } from '@/lib/types';
import { api } from '@/lib/api';

export function AssignmentModal({
  open,
  onOpenChange,
  contractors,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contractors: DirectoryContractorList[];
  onSaved: () => void;
}) {
  const mains = useMemo(() => contractors.filter((c) => c.type === 'main'), [contractors]);
  const subs = useMemo(() => contractors.filter((c) => c.type === 'sub'), [contractors]);
  const [sites, setSites] = useState<Site[]>([]);
  const [mainId, setMainId] = useState('');
  const [subId, setSubId] = useState('');
  const [siteId, setSiteId] = useState<string>('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await api.sites.list();
        if (!cancelled) setSites(s);
      } catch {
        if (!cancelled) setSites([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const submit = async () => {
    if (!mainId || !subId) return;
    setLoading(true);
    try {
      await api.directoryContractors.createAssignment({
        main_contractor_id: mainId,
        sub_contractor_id: subId,
        ...(siteId && siteId !== '__none__' ? { site_id: parseInt(siteId, 10) } : {}),
        ...(start ? { start_date: start } : {}),
        ...(end ? { end_date: end } : {}),
        ...(notes.trim() ? { notes: notes.trim().replace(/[<>]/g, '') } : {}),
      });
      onSaved();
      onOpenChange(false);
      setMainId('');
      setSubId('');
      setSiteId('');
      setStart('');
      setEnd('');
      setNotes('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign sub to main</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Main contractor</Label>
            <SearchableSelect
              value={mainId}
              onChange={setMainId}
              options={mains.map((m) => ({ value: m.id, label: m.name }))}
              placeholder="Select main"
              searchPlaceholder="Search main contractors…"
            />
          </div>
          <div className="space-y-1">
            <Label>Sub-contractor</Label>
            <SearchableSelect
              value={subId}
              onChange={setSubId}
              options={subs.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Select sub"
              searchPlaceholder="Search sub-contractors…"
            />
          </div>
          <div className="space-y-1">
            <Label>Site (optional)</Label>
            <SearchableSelect
              value={siteId}
              onChange={setSiteId}
              options={sites.map((s) => ({ value: s.id.toString(), label: s.name }))}
              noneOption={{ value: '', label: 'Any site' }}
              placeholder="Any site"
              searchPlaceholder="Search sites…"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Start</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>End</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input maxLength={TEXT_LIMITS.note} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button className="w-full" disabled={loading || !mainId || !subId} onClick={() => void submit()}>
            {loading ? 'Saving…' : 'Create assignment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
