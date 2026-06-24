import { noIndexFollow } from '@/lib/marketing-seo';

export const metadata = {
  title: { absolute: 'Sign In | ControlOps' },
  ...noIndexFollow,
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
