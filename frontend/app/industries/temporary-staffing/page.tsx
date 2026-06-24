import { IndustryPageClient } from '@/components/marketing/industry-page-client';
import { staffingIndustryMetadata } from '@/lib/marketing-seo';

export const metadata = staffingIndustryMetadata;

export default function TemporaryStaffingPage() {
  return <IndustryPageClient industry="temporary" />;
}
