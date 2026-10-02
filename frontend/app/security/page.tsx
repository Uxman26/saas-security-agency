import { LegalPageClient } from '@/components/marketing/legal-page-client';
import { securityPageMetadata } from '@/lib/marketing-seo';

export const metadata = securityPageMetadata;

export default function SecurityPage() {
  return <LegalPageClient page="security" />;
}
