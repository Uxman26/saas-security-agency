import { IndustryPageClient } from '@/components/marketing/industry-page-client';
import { cleaningIndustryMetadata } from '@/lib/marketing-seo';

export const metadata = cleaningIndustryMetadata;

export default function CleaningIndustryPage() {
  return <IndustryPageClient industry="cleaning" />;
}
