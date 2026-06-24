import { LegalPage } from '@/components/marketing/legal-page';

export const metadata = { title: 'Cookie Policy | ControlOps' };

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy">
      <p>ControlOps uses cookies and similar technologies for authentication, preferences and service operation. Full cookie policy documentation will be published here.</p>
    </LegalPage>
  );
}
