import { LegalPageClient } from '@/components/marketing/legal-page-client';
import { accessibilityMetadata } from '@/lib/marketing-seo';

export const metadata = accessibilityMetadata;

export default function AccessibilityPage() {
  return <LegalPageClient page="accessibility" />;
}
