import { LegalPage } from '@/components/marketing/legal-page';
import { AccessibilityContent } from '@/components/marketing/accessibility-content';
import { accessibilityMetadata } from '@/lib/marketing-seo';

export const metadata = accessibilityMetadata;

export default function AccessibilityPage() {
  return (
    <LegalPage title="Accessibility Statement" effectiveDate="14 September 2026" version="1.0">
      <AccessibilityContent />
    </LegalPage>
  );
}