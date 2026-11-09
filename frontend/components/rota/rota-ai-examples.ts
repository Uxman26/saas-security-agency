/** Ready-made AI Rota prompts. Clicking fills the input only — never auto-sends. */

export type RotaExample = {
  id: string;
  label: string;
  prompt: string;
  /** When true, sending may return guidance that the action isn’t supported via chat. */
  guidanceOnly?: boolean;
};

export type RotaExampleGroup = {
  id: string;
  title: string;
  examples: RotaExample[];
};

export const ROTA_AI_INSTRUCTIONS = [
  'Name the staff member and the site exactly as they appear in ControlOps (small spelling differences are OK).',
  'Include a date (today, tomorrow, Monday, or 2026-11-20) and times (09:00-17:00, 9am-5pm, or “morning shift”).',
  'Review the proposal, then Confirm — shifts are never saved until you confirm.',
  'Replace sample names below with people and sites from your company.',
];

export const ROTA_AI_EXAMPLE_GROUPS: RotaExampleGroup[] = [
  {
    id: 'single',
    title: 'Single employee',
    examples: [
      {
        id: 'single-clock',
        label: 'One shift with times',
        prompt: 'Create a shift for Alex at North Gate tomorrow 08:00-16:00',
      },
      {
        id: 'single-ampm',
        label: '9am–5pm style',
        prompt: 'Book Sarah at Warehouse on Friday 9am-5pm',
      },
    ],
  },
  {
    id: 'multi',
    title: 'Multiple employees',
    examples: [
      {
        id: 'multi-same-site',
        label: 'Two people, one site',
        prompt: 'Schedule a shift for Alex and Jordan at North Gate Monday 09:00-17:00',
      },
    ],
  },
  {
    id: 'site',
    title: 'Client / site',
    examples: [
      {
        id: 'named-site',
        label: 'Named site',
        prompt: 'Assign Priya at Hilton Hotel tomorrow 14:00-22:00',
      },
      {
        id: 'two-sites-note',
        label: 'Different sites (send twice)',
        prompt: 'Create a shift for Alex at North Gate tomorrow 09:00-17:00',
      },
    ],
  },
  {
    id: 'periods',
    title: 'Morning · afternoon · evening · night',
    examples: [
      {
        id: 'morning',
        label: 'Morning shift',
        prompt: 'Create a morning shift for Alex at North Gate tomorrow',
      },
      {
        id: 'afternoon',
        label: 'Afternoon shift',
        prompt: 'Create an afternoon shift for Sarah at Warehouse on Friday',
      },
      {
        id: 'evening',
        label: 'Evening shift',
        prompt: 'Schedule an evening shift for Priya at Hilton Monday',
      },
      {
        id: 'night',
        label: 'Night shift',
        prompt: 'Book a night shift for Omar at Airport Terminal tomorrow',
      },
    ],
  },
  {
    id: 'dates',
    title: 'Specific dates',
    examples: [
      {
        id: 'iso-date',
        label: 'Exact calendar date',
        prompt: 'Create a shift for Alex at North Gate on 2026-11-20 10:00-18:00',
      },
      {
        id: 'next-weekday',
        label: 'Next Monday',
        prompt: 'Assign Jordan at City Mall next Monday 12:00-20:00',
      },
    ],
  },
  {
    id: 'advanced',
    title: 'Recurring & edits (guidance)',
    examples: [
      {
        id: 'recurring',
        label: 'Weekly / recurring',
        prompt: 'Create a shift for Alex at North Gate every Monday 09:00-17:00',
        guidanceOnly: true,
      },
      {
        id: 'modify',
        label: 'Modify existing shift',
        prompt: "Move Alex's shift tomorrow to 10:00-18:00",
        guidanceOnly: true,
      },
    ],
  },
];
