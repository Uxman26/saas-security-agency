import { LegalPage } from '@/components/marketing/legal-page';
import { PrivacyNoticeContent } from '@/components/marketing/privacy-notice-content';
import { privacyMetadata } from '@/lib/marketing-seo';

export const metadata = privacyMetadata;

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Notice" effectiveDate="14 September 2026" version="1.0">
      <PrivacyNoticeContent />
    </LegalPage>
  );
}
