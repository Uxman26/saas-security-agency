import { noIndexFollow } from '@/lib/marketing-seo';

export const metadata = {
  title: { absolute: 'Sign In | Control Operations' },
  ...noIndexFollow,
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
