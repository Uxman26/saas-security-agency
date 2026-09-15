import { LegalPage } from '@/components/marketing/legal-page';
import { CookiePolicyContent } from '@/components/marketing/cookie-policy-content';
import { cookiesMetadata } from '@/lib/marketing-seo';

export const metadata = cookiesMetadata;

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy" effectiveDate="14 September 2026" version="1.0">
      <CookiePolicyContent />
    </LegalPage>
  );
}
