import { noIndexFollow } from '@/lib/marketing-seo';

export const metadata = {
  title: { absolute: 'Create a ControlOps Account' },
  ...noIndexFollow,
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
