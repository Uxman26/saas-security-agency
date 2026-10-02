import { LegalPageClient } from '@/components/marketing/legal-page-client';
import { dpaMetadata } from '@/lib/marketing-seo';

export const metadata = dpaMetadata;

export default function DpaPage() {
  return <LegalPageClient page="dpa" />;
}
