'use client';

import { LeadsListView } from '@/components/leads/leads-list-view';

export default function MeetingsPage() {
  return (
    <LeadsListView
      title="Meetings"
      description="Leads with scheduled meetings"
      fixedFilters={{ meetings_only: true }}
      showDates
      showFullFilters={false}
    />
  );
}
