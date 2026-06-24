import { PlatformContent } from '@/components/marketing/platform-content';
import { platformMetadata } from '@/lib/marketing-seo';

export const metadata = platformMetadata;

export default function PlatformPage() {
  return <PlatformContent />;
}
