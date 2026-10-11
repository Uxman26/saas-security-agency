'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ReportIssueDialog } from '@/components/feedback/report-issue-dialog';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        An unexpected error occurred. You can try again, or report the issue to ControlOps support.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => setReportOpen(true)}>
          Report an issue
        </Button>
      </div>
      <ReportIssueDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        defaultCategory="application_crash"
        defaultSubject="Unexpected application error"
        defaultDescription={error.message ? `Error: ${error.message}` : ''}
        diagnosticExtras={{
          error_category: 'application_crash',
          error_message: error.message,
          error_code: error.digest,
          correlation_id: error.digest,
        }}
      />
    </div>
  );
}
