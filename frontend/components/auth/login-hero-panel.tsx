import Image from 'next/image';
import { Clock, FileText, MapPin, Receipt, ShieldCheck, Users } from 'lucide-react';

const ORANGE = '#F45100';

const FEATURES = [
  {
    icon: Clock,
    title: 'Real-time shift tracking',
    body: 'Monitor attendance, breaks, and overtime as it happens.',
  },
  {
    icon: Receipt,
    title: 'Manage expenses',
    body: 'Track and manage operational expenses, costs and budgets.',
  },
  {
    icon: MapPin,
    title: 'Geo-verified clock in/out',
    body: 'Ensure accountability with GPS-verified check-ins and patrols.',
  },
  {
    icon: Users,
    title: 'Payroll',
    body: 'Automate payroll, manage hours and stay compliant.',
  },
  {
    icon: ShieldCheck,
    title: 'Incident reporting & rota management',
    body: 'Streamline incident logs, compliance, and shift scheduling.',
  },
  {
    icon: FileText,
    title: 'Invoices',
    body: 'Create, track and manage invoices with ease.',
  },
];

/**
 * The marketing panel beside the sign-in card.
 *
 * Everything here is text, SVG and CSS rather than a flattened bitmap: the old panel was a
 * 508px-wide JPEG stretched across a full-height column, so its headline and icons were
 * visibly soft on any normal display and unusable on a HiDPI one. Vector output is sharp at
 * every resolution, so it also costs nothing to ship and nothing to re-export when the copy
 * changes.
 */
export function LoginHeroPanel() {
  return (
    <div className="relative flex h-full w-full flex-col justify-center overflow-hidden px-10 py-12 xl:px-14">
      <SecurityBackdrop />

      <div className="relative z-10 mx-auto w-full max-w-[640px]">
        <div className="flex items-center gap-3">
          <Image
            src="/ControlOps-Logos/controlOps-icon.png"
            alt=""
            width={44}
            height={44}
            priority
            unoptimized
            className="h-9 w-9 object-contain"
          />
          <span
            className="text-[17px] font-semibold tracking-tight"
            style={{ color: ORANGE }}
          >
            Shift Coverage Everywhere
          </span>
        </div>

        <h2 className="mt-7 text-[40px] font-bold leading-[1.08] tracking-tight text-neutral-900 xl:text-[46px]">
          Smart Workforce
          <br />
          Management for
          <br />
          Smarter Operations
          <span style={{ color: ORANGE }}>.</span>
        </h2>

        <p className="mt-5 max-w-[30rem] text-[17px] leading-relaxed text-neutral-600">
          One platform to plan, manage, track, and optimise your workforce operations in real
          time.
        </p>

        <ul className="mt-10 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3.5">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-[0_8px_20px_rgba(244,81,0,0.14)] ring-1 ring-[#F45100]/12"
                aria-hidden
              >
                <Icon className="size-[22px]" strokeWidth={1.75} style={{ color: ORANGE }} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-snug text-neutral-900">
                  {title}
                </span>
                <span className="mt-1 block text-[13.5px] leading-snug text-neutral-600">
                  {body}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Brand-tinted operations backdrop: a control-room grid, radar sweep and shield outline.
 * Drawn as one inline SVG so it scales without resampling and needs no network request.
 */
function SecurityBackdrop() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 900 1200"
      fill="none"
    >
      <defs>
        <linearGradient id="lhp-wash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFF3EA" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="lhp-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ORANGE} stopOpacity="0.16" />
          <stop offset="100%" stopColor={ORANGE} stopOpacity="0" />
        </radialGradient>
        <pattern id="lhp-grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path
            d="M48 0H0v48"
            stroke={ORANGE}
            strokeOpacity="0.07"
            strokeWidth="1"
            fill="none"
          />
        </pattern>
      </defs>

      <rect width="900" height="1200" fill="url(#lhp-grid)" />
      <rect width="900" height="1200" fill="url(#lhp-wash)" />
      <circle cx="760" cy="200" r="280" fill="url(#lhp-glow)" />
      <circle cx="120" cy="1020" r="260" fill="url(#lhp-glow)" />

      {[150, 240, 330].map((r) => (
        <circle
          key={r}
          cx="760"
          cy="1010"
          r={r}
          stroke={ORANGE}
          strokeOpacity="0.1"
          strokeWidth="1.5"
        />
      ))}

      <path
        d="M132 120c38-16 62-30 78-44 16 14 40 28 78 44v78c0 62-36 106-78 124-42-18-78-62-78-124z"
        stroke={ORANGE}
        strokeOpacity="0.13"
        strokeWidth="2.5"
        fill="none"
      />
      <path
        d="M176 196l24 24 40-46"
        stroke={ORANGE}
        strokeOpacity="0.13"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
