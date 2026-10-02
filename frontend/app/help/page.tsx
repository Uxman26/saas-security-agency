import { HelpShell, HelpHubGrid } from '@/components/help/help-shell';
import { helpMetadata } from '@/lib/marketing-seo';

export const metadata = helpMetadata;

export default function HelpPage() {
  return (
    <HelpShell>
      <HelpHubGrid />
    </HelpShell>
  );
}
