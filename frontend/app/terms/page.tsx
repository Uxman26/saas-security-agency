import { LegalPage } from '@/components/marketing/legal-page';
import { TermsOfServiceContent } from '@/components/marketing/terms-of-service-content';
import { termsMetadata } from '@/lib/marketing-seo';

export const metadata = termsMetadata;

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" effectiveDate="14 September 2026" version="1.0">
      <TermsOfServiceContent />
    </LegalPage>
  );
}
