'use client';

import { LeadsListView } from '@/components/leads/leads-list-view';

export default function UpcomingFollowUpsPage() {
  return (
    <LeadsListView
      title="Upcoming follow-ups"
      description="Follow-ups scheduled from now onwards"
      fixedFilters={{ upcoming_follow_ups: true }}
      showDates
      showFullFilters={false}
    />
  );
}
