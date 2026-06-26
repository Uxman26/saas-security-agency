'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const links = [
  { href: '/leads', label: 'All leads' },
  { href: '/leads/follow-ups', label: 'Follow-ups' },
  { href: '/leads/follow-ups/today', label: "Today's follow-ups" },
  { href: '/leads/follow-ups/upcoming', label: 'Upcoming follow-ups' },
  { href: '/leads/meetings', label: 'Meetings' },
];

export function LeadsSubnav() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-2 border-b pb-3">
      {links.map((l) => {
        const active = l.href === '/leads' ? pathname === '/leads' : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
