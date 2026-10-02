import { ContactContent } from '@/components/marketing/contact-content';
import { contactMetadata } from '@/lib/marketing-seo';

export const metadata = contactMetadata;

export default function ContactPage() {
  return <ContactContent />;
}
