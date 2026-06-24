import { IndustryPageClient } from '@/components/marketing/industry-page-client';
import { securityIndustryMetadata } from '@/lib/marketing-seo';

export const metadata = securityIndustryMetadata;

export default function SecurityIndustryPage() {
  return <IndustryPageClient industry="security" />;
}
