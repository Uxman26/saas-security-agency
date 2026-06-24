import { IndustriesIndexContent } from '@/components/marketing/industries-index-content';
import { industriesMetadata } from '@/lib/marketing-seo';

export const metadata = industriesMetadata;

export default function IndustriesPage() {
  return <IndustriesIndexContent />;
}
