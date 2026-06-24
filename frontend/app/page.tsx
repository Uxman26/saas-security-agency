import { homeMetadata } from '@/lib/marketing-seo';
import { HomePage } from '@/components/marketing/home-page';

export const metadata = homeMetadata;

export default function Page() {
  return <HomePage />;
}
