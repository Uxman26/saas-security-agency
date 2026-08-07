'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shield } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function CompanyBrand({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const name = user?.company_name || 'ControlOps';

  useEffect(() => {
    if (!user?.logo_url) {
      setLogoSrc(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    const token = localStorage.getItem('token')?.trim();
    void (async () => {
      try {
        const res = await fetch(`${API_URL}${user.logo_url}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLogoSrc(objectUrl);
      } catch {
        if (!cancelled) setLogoSrc(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [user?.logo_url]);

  return (
    <Link
      href="/dashboard"
      className={cn('flex min-w-0 items-center gap-2 font-semibold text-sidebar-foreground', className)}
    >
      {logoSrc ? (
        <img src={logoSrc} alt="" className="h-11 w-auto max-w-[180px] object-contain shrink-0" />
      ) : (
        <Shield className="size-5 shrink-0 text-sidebar-primary" />
      )}
      <span className="truncate">{name}</span>
    </Link>
  );
}
