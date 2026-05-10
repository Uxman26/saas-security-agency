'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
            <Select value={mainId} onValueChange={setMainId}>
              <SelectTrigger>
                <SelectValue placeholder="Select main" />
              </SelectTrigger>
              <SelectContent>
                {mains.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Sub-contractor</Label>
            <Select value={subId} onValueChange={setSubId}>
              <SelectTrigger>
                <SelectValue placeholder="Select sub" />
              </SelectTrigger>
              <SelectContent>
                {subs.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Site (optional)</Label>
            <Select value={siteId || '__none__'} onValueChange={(v) => setSiteId(v === '__none__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Any site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Any site</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button className="w-full" disabled={loading || !mainId || !subId} onClick={() => void submit()}>
            {loading ? 'Saving…' : 'Create assignment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
