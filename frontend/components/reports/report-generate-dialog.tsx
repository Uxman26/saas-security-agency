'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReportResultView } from '@/components/reports/report-result-view';
import type { Guard } from '@/lib/types';
import { FileSpreadsheet, FileText } from 'lucide-react';

type ReportView =
  | { kind: 'individual'; data: import('@/lib/types').StaffIndividualReport }
  | { kind: 'monthly'; data: import('@/lib/types').StaffMonthlyReport }
  | { kind: 'subscription'; summary: import('@/lib/types').SubscriptionReportSummary; rows: Record<string, unknown>[] }
  | { kind: 'usage'; data: import('@/lib/types').UsageSummary }
  | { kind: 'rows'; columns: { key: string; label: string; fmt?: (v: unknown) => string }[]; rows: Record<string, unknown>[] };

type ReportMeta = {
  id: string;
  title: string;
  desc: string;
  noExport?: boolean;
  exportType: string;
};

type Props = {
  open: boolean;
  report: ReportMeta | null;
  startDate: string;
  endDate: string;
  guardId: string;
  guards: Guard[];
  loading: boolean;
  result: ReportView | null;
  onClose: () => void;
  onStartDate: (v: string) => void;
  onEndDate: (v: string) => void;
  onGuardId: (v: string) => void;
  onGenerate: () => void;
  onExport: (format: string) => void;
};

export function ReportGenerateDialog({
  open,
  report,
  startDate,
  endDate,
  guardId,
  guards,
  loading,
  result,
  onClose,
  onStartDate,
  onEndDate,
  onGuardId,
  onGenerate,
  onExport,
}: Props) {
  const showStaff = report?.id === 'shifts' || report?.id === 'attendance';
  const canExport = report && !report.noExport && report.exportType !== 'expenses' && report.exportType !== 'usage';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{report?.title}</DialogTitle>
        </DialogHeader>
        {report && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground -mt-2">{report.desc}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input type="date" value={startDate} onChange={(e) => onStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input type="date" value={endDate} onChange={(e) => onEndDate(e.target.value)} />
              </div>
            </div>

            {showStaff && (
              <div className="space-y-1.5">
                <Label>Staff (optional)</Label>
                <Select value={guardId || 'all'} onValueChange={(v) => onGuardId(v === 'all' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="All staff" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All staff</SelectItem>
                    {guards.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button onClick={onGenerate} disabled={loading} className="min-w-[100px]">
                {loading ? 'Generating…' : 'Generate'}
              </Button>
              {canExport && (
                <>
                  <Button variant="outline" size="sm" onClick={() => onExport('csv')}>
                    <FileSpreadsheet className="size-4 mr-1.5" />
                    CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onExport('xlsx')}>
                    <FileSpreadsheet className="size-4 mr-1.5" />
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onExport('pdf')}>
                    <FileText className="size-4 mr-1.5" />
                    PDF
                  </Button>
                </>
              )}
            </div>

            {result && (
              <div className="rounded-lg border bg-muted/20 p-4 max-h-[50vh] overflow-y-auto">
                <ReportResultView view={result} />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
