import Image from 'next/image';
import Link from 'next/link';
import { Shield } from 'lucide-react';

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  topLink?: { href: string; label: string };
};

export function AuthShell({ title, subtitle, children, footer, topLink }: AuthShellProps) {
  return (
    <div className="min-h-screen flex bg-white text-[#161E2C]">
      <div className="hidden lg:flex lg:w-[48%] relative flex-col justify-between p-10 xl:p-14 overflow-hidden border-r border-[#E5E7EB]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-1/4 size-[420px] rounded-full border border-[#FD6203]/10" />
          <div className="absolute -left-12 top-1/3 size-[320px] rounded-full border border-[#FD6203]/15" />
          <div className="absolute left-8 top-[38%] size-[220px] rounded-full border border-[#FD6203]/20" />
          <div className="absolute right-0 bottom-0 size-[280px] rounded-full border border-[#161E2C]/5 translate-x-1/3 translate-y-1/3" />
        </div>
        <div className="relative">
          <Image
            src="/ControlOps-Logos/controlOps-horizontal-logo.png"
            alt="ControlOps"
            width={280}
            height={72}
            className="h-14 w-auto"
            priority
          />
        </div>
        <div className="relative space-y-4 max-w-lg">
          <h1 className="text-4xl xl:text-5xl font-bold tracking-tight text-[#161E2C]">ControlOps</h1>
          <p className="text-xl font-semibold text-[#FD6203]">Command with Clarity.</p>
          <p className="text-base text-[#4B5563] leading-relaxed">
            Smart workforce management for security teams. Real-time visibility, smarter decisions, operational excellence.
          </p>
        </div>
        <p className="relative text-sm text-[#4B5563] flex items-center gap-2">
          <Shield className="size-4 text-[#FD6203]" />
          Secure. Reliable. Always.
        </p>
      </div>

      <div className="flex-1 flex flex-col min-h-screen bg-[#F3F4F6]">
        {topLink && (
          <div className="flex justify-end p-4 sm:p-6">
            <Link href={topLink.href} className="text-sm font-medium text-[#4B5563] hover:text-[#161E2C]">
              {topLink.label}
            </Link>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center px-4 pb-8 sm:px-6">
          <div className="w-full max-w-[420px]">
            <div className="lg:hidden flex justify-center mb-8">
              <Image
                src="/ControlOps-Logos/controlOps-logo.png"
                alt="ControlOps"
                width={120}
                height={120}
                className="size-24"
                priority
              />
            </div>
            <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(22,30,44,0.08)] border border-[#E5E7EB] p-8 sm:p-10">
              <div className="mb-8 text-center lg:text-left">
                <h2 className="text-2xl font-bold text-[#161E2C]">{title}</h2>
                <p className="mt-2 text-sm text-[#4B5563]">{subtitle}</p>
              </div>
              {children}
            </div>
            {footer && <div className="mt-6 text-center text-sm text-[#4B5563]">{footer}</div>}
          </div>
        </div>
        <p className="px-6 pb-8 text-center text-xs text-[#4B5563] flex items-center justify-center gap-2">
          <Shield className="size-3.5 text-[#FD6203]" />
          Secure access for operations teams. Enterprise-grade encryption.
        </p>
      </div>
    </div>
  );
}
