import { IndustryPageClient } from '@/components/marketing/industry-page-client';
import { eventIndustryMetadata } from '@/lib/marketing-seo';

export const metadata = eventIndustryMetadata;

export default function EventStaffingPage() {
  return <IndustryPageClient industry="event" />;
}
