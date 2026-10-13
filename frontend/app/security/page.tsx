import { LegalPage } from '@/components/marketing/legal-page';
import { SecurityContent } from '@/components/marketing/security-content';
import { securityPageMetadata } from '@/lib/marketing-seo';

export const metadata = securityPageMetadata;

export default function SecurityPage() {
  return (
    <LegalPage title="Security" effectiveDate="14 September 2026" version="1.0">
      <SecurityContent />
    </LegalPage>
  );
}
