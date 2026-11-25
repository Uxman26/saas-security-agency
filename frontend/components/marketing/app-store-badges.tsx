import { cn } from '@/lib/utils';

export const IOS_APP_URL = 'https://apps.apple.com/us/app/controlops/id6826312490';
export const ANDROID_APP_URL = 'https://play.google.com/store/apps/details?id=uk.co.controlops';

const BADGES = [
  { href: IOS_APP_URL, src: '/badges/app-store.jpeg', alt: 'Download ControlOps on the App Store', w: 578, h: 183 },
  { href: ANDROID_APP_URL, src: '/badges/google-play.jpeg', alt: 'Get ControlOps on Google Play', w: 582, h: 183 },
] as const;

/** App Store and Google Play badges linking to the ControlOps mobile apps. */
export function AppStoreBadges({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const height = size === 'sm' ? 'h-10' : 'h-12';
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {BADGES.map((b) => (
        <a
          key={b.href}
          href={b.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.src} alt={b.alt} width={b.w} height={b.h} className={cn(height, 'w-auto rounded-lg')} loading="lazy" />
        </a>
      ))}
    </div>
  );
}
