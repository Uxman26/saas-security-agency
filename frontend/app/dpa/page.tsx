import { LegalPage } from '@/components/marketing/legal-page';
import { DpaContent } from '@/components/marketing/dpa-content';
import { dpaMetadata } from '@/lib/marketing-seo';

export const metadata = dpaMetadata;

export default function DpaPage() {
  return (
    <LegalPage title="Data Processing Agreement" effectiveDate="14 September 2026" version="1.0">
      <DpaContent />
    </LegalPage>
  );
}
