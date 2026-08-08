'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ReportResultView } from '@/components/reports/report-result-view';
import type { Guard, Site } from '@/lib/types';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const WIDE_REPORTS = new Set(['shift-overtime', 'shift-early-finish', 'login-logs', 'attendance', 'sms-logs', 'shifts']);
const STAFF_FILTER_REPORTS = new Set(['shifts', 'attendance', 'shift-overtime', 'shift-early-finish']);
const SITE_FILTER_REPORTS = new Set(['shifts']);
const GROUP_BY_REPORTS = new Set(['staff-monthly', 'overtime']);

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
  siteId: string;
  groupBy: string;
  guards: Guard[];
  sites: Site[];
  loading: boolean;
  result: ReportView | null;
  onClose: () => void;
  onStartDate: (v: string) => void;
  onEndDate: (v: string) => void;
  onGuardId: (v: string) => void;
  onSiteId: (v: string) => void;
  onGroupBy: (v: string) => void;
  onGenerate: () => void;
  onExport: (format: string) => void;
};

export function ReportGenerateDialog({
  open,
  report,
  startDate,
  endDate,
  guardId,
  siteId,
  groupBy,
  guards,
  sites,
  loading,
  result,
  onClose,
  onStartDate,
  onEndDate,
  onGuardId,
  onSiteId,
  onGroupBy,
  onGenerate,
  onExport,
}: Props) {
  const showStaff = report ? STAFF_FILTER_REPORTS.has(report.id) : false;
  const showSite = report ? SITE_FILTER_REPORTS.has(report.id) : false;
  const showGroupBy = report ? GROUP_BY_REPORTS.has(report.id) : false;
  const wide = report ? WIDE_REPORTS.has(report.id) : false;
  const canExport = report && !report.noExport && report.exportType !== 'expenses' && report.exportType !== 'usage';

  const staffOptions = guards.map((g) => ({ value: String(g.id), label: g.full_name }));
  const siteOptions = sites.map((s) => ({ value: String(s.id), label: s.name }));

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
                  <SearchableSelect
                    value={guardId || 'all'}
                    options={staffOptions}
                    noneOption={{ value: 'all', label: 'All staff' }}
                    placeholder="All staff"
                    searchPlaceholder="Search staff…"
                    onChange={(v) => onGuardId(v === 'all' ? '' : v)}
                  />
                </div>
              )}

              {showSite && (
                <div className="space-y-1.5">
                  <Label>Site (optional)</Label>
                  <SearchableSelect
                    value={siteId || 'all'}
                    options={siteOptions}
                    noneOption={{ value: 'all', label: 'All sites' }}
                    placeholder="All sites"
                    searchPlaceholder="Search sites…"
                    onChange={(v) => onSiteId(v === 'all' ? '' : v)}
                  />
                </div>
              )}

              {showGroupBy && (
                <div className="space-y-1.5">
                  <Label>Group by</Label>
                  <Select value={groupBy || 'guard'} onValueChange={onGroupBy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="guard">By employee</SelectItem>
                      <SelectItem value="site">By site</SelectItem>
                      <SelectItem value="client">By client</SelectItem>
                      <SelectItem value="site_client">By site &amp; client</SelectItem>
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
                    <Button type="button" variant="outline" size="sm" onClick={() => onExport('csv')} disabled={loading}>
                      <FileText className="size-3.5 me-1" />
                      CSV
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => onExport('xlsx')} disabled={loading}>
                      <FileSpreadsheet className="size-3.5 me-1" />
                      Excel
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => onExport('pdf')} disabled={loading}>
                      PDF
                    </Button>
                  </>
                )}
              </div>

              {result && (
                <div className="pt-2 border-t">
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
