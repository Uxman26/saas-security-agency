'use client';

import { LeadsListView } from '@/components/leads/leads-list-view';

export default function FollowUpsPage() {
  return (
    <LeadsListView
      title="Follow-ups"
      description="Leads with scheduled follow-up dates"
      fixedFilters={{ has_follow_up: true }}
      showDates
      showFullFilters={false}
    />
  );
}
