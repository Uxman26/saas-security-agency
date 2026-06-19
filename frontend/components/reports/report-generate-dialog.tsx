'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReportResultView } from '@/components/reports/report-result-view';
import type { Guard } from '@/lib/types';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const WIDE_REPORTS = new Set(['shift-overtime', 'shift-early-finish', 'login-logs', 'attendance', 'sms-logs']);
const STAFF_FILTER_REPORTS = new Set(['shifts', 'attendance', 'shift-overtime', 'shift-early-finish']);

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
  const showStaff = report ? STAFF_FILTER_REPORTS.has(report.id) : false;
  const wide = report ? WIDE_REPORTS.has(report.id) : false;
  const canExport = report && !report.noExport && report.exportType !== 'expenses' && report.exportType !== 'usage';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          'overflow-hidden max-h-[90vh] p-0 gap-0',
          wide ? 'sm:max-w-4xl' : 'sm:max-w-xl'
        )}
      >
        {report && (
          <div className="flex flex-col min-h-0 max-h-[90vh]">
            <div className="shrink-0 px-6 pt-6 pb-4 border-b">
              <DialogHeader>
                <DialogTitle className="text-xl pr-8">{report.title}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground mt-2">{report.desc}</p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={startDate} onChange={(e) => onStartDate(e.target.value)} className="w-full" />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={endDate} onChange={(e) => onEndDate(e.target.value)} className="w-full" />
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

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={onGenerate}
                  disabled={loading}
                  className="min-w-[100px] bg-[#FD6203] hover:bg-[#DF3C01] text-white"
                >
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
                <div className="min-w-0 overflow-hidden pt-1">
                  <ReportResultView view={result} />
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
