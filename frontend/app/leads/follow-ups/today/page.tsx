'use client';

import { LeadsListView } from '@/components/leads/leads-list-view';

export default function TodayFollowUpsPage() {
  return (
    <LeadsListView
      title="Today's follow-ups"
      description="Follow-ups scheduled for today"
      fixedFilters={{ today_follow_ups: true }}
      showDates
      showFullFilters={false}
    />
  );
}
