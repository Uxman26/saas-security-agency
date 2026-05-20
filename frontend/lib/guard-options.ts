export const TITLES = ['Mr', 'Mrs', 'Ms', 'Miss', 'Mx', 'Dr'] as const;

export const GENDERS = [
  'Male',
  'Female',
  'Non-binary',
  'Transgender',
  'Unspecified',
] as const;

export const ETHNICITIES = [
  'Arab',
  'Asian/Asian British',
  'Bangladeshi',
  'Black/African/Caribbean/Black British',
  'Chinese',
  'Indian',
  'Irish Traveller',
  'Mixed/Multiple ethnic groups',
  'Other',
  'Other Asian background',
  'Pakistani',
  'White',
  'Unspecified',
] as const;

export const HOLIDAY_JURISDICTIONS = [
  { value: 'england_wales', label: 'England & Wales' },
  { value: 'northern_ireland', label: 'Northern Ireland' },
  { value: 'scotland', label: 'Scotland' },
] as const;

export const EMPLOYEE_TYPES = [
  {
    value: 'fixed',
    label: 'Fixed, full or part time',
    description:
      'Employees on a repeating working time pattern who work fixed, predictable numbers of hours and have a fixed leave entitlement.',
  },
  {
    value: 'variable',
    label: 'Short hours or variable',
    description:
      'Employees on a contract who work a different number of hours or days from week to week.',
  },
] as const;

export const WORKING_TIME_PATTERNS = [
  { value: 'mon_fri_9_5', label: 'Mon-Fri 9-5 (5 days, 35hr)' },
  { value: 'mon_sat_8_4', label: 'Mon-Sat 8-4 (6 days, 48hr)' },
  { value: 'four_on_four_off', label: '4 on 4 off (12hr shifts)' },
] as const;

export const ENTITLEMENT_UNITS = [
  {
    value: 'days',
    label: 'Days',
    description:
      'The employee can take holiday in day or half day units. Entitlement, absence and balance will be shown in days.',
  },
  {
    value: 'hours',
    label: 'Hours',
    description:
      'The employee can take holiday in smaller increments. Entitlement, absence and balance will be shown in hours.',
  },
] as const;

export const EMERGENCY_RELATIONSHIPS = [
  'Spouse',
  'Partner',
  'Parent',
  'Sibling',
  'Child',
  'Friend',
  'Other',
] as const;

export const LEAVE_MONTHS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
] as const;
