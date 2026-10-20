import { noIndexFollow } from '@/lib/marketing-seo';

export const metadata = {
  title: { absolute: 'Administrator Sign In | ControlOps' },
  ...noIndexFollow,
};

export default function SuperAdminLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
