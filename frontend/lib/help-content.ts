/**
 * ControlOps Help Centre — edit articles here.
 * Routes: /help and /help/[slug]
 */

export type HelpBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'bullets'; items: string[] }
  | { type: 'tip'; text: string }
  | { type: 'links'; items: { label: string; href: string }[] };

export type HelpCategoryId =
  | 'getting-started'
  | 'features'
  | 'account'
  | 'faq'
  | 'support';

export type HelpArticle = {
  slug: string;
  title: string;
  description: string;
  category: HelpCategoryId;
  order: number;
  body: HelpBlock[];
};

export type HelpCategory = {
  id: HelpCategoryId;
  title: string;
  description: string;
};

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    description: 'Sign up, verify your account, and set up your company.',
  },
  {
    id: 'features',
    title: 'Features',
    description: 'How to use workforce, rota, payroll, invoicing, and more.',
  },
  {
    id: 'account',
    title: 'Account & settings',
    description: 'Company profile, billing, users, roles, email, and SMS.',
  },
  {
    id: 'faq',
    title: 'FAQ & troubleshooting',
    description: 'Answers to common questions and login issues.',
  },
  {
    id: 'support',
    title: 'Support',
    description: 'How to get help from the ControlOps team.',
  },
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: 'getting-started',
    title: 'Getting started with ControlOps',
    description: 'From choosing a plan to your first dashboard login.',
    category: 'getting-started',
    order: 1,
    body: [
      {
        type: 'paragraph',
        text: 'ControlOps is workforce operations software for shift-based service businesses. You manage staff, contractors, sites, rotas, payroll preparation, invoicing, and related records in one place.',
      },
      { type: 'heading', text: 'Create your account' },
      {
        type: 'steps',
        items: [
          'Open Pricing and choose Basic, Standard, Premium, or Enterprise (monthly or yearly).',
          'Complete signup with your name, work email, password, company name, industry, and workforce size.',
          'Verify your email if prompted, then complete payment (card or bank reference) on the payment pending page.',
          'Sign in and open the Dashboard.',
        ],
      },
      {
        type: 'tip',
        text: 'Signup requires a plan from Pricing. You cannot create a company without selecting a tier first.',
      },
      { type: 'heading', text: 'Recommended first setup' },
      {
        type: 'bullets',
        items: [
          'Company profile — logo, contact details, and bank details used on invoices.',
          'Staff — add employees and compliance documents.',
          'Sites — add client locations and default rates.',
          'Roles & Permissions — invite users and assign access.',
          'Rotas & Shifts — create and publish your first rota.',
        ],
      },
      {
        type: 'links',
        items: [
          { label: 'View pricing', href: '/pricing' },
          { label: 'Book a demo', href: '/book-demo' },
          { label: 'Platform overview', href: '/platform' },
        ],
      },
    ],
  },
  {
    slug: 'signup-login',
    title: 'Signup, login, and password reset',
    description: 'Account access, email verification, and resetting passwords.',
    category: 'getting-started',
    order: 2,
    body: [
      { type: 'heading', text: 'Sign in' },
      {
        type: 'paragraph',
        text: 'Use your work email and password on the Sign in page. If login fails, you will see a clear message that the email or password is incorrect.',
      },
      { type: 'heading', text: 'Email verification' },
      {
        type: 'paragraph',
        text: 'Some accounts must verify email before full access. Check your inbox for the verification link, then return to ControlOps.',
      },
      { type: 'heading', text: 'Payment pending' },
      {
        type: 'paragraph',
        text: 'New companies may be held on the payment pending page until card payment succeeds or a bank payment is confirmed. After that, the Dashboard unlocks.',
      },
      { type: 'heading', text: 'Forgot password' },
      {
        type: 'steps',
        items: [
          'Open Forgot password and enter your email.',
          'Open the reset link from your email.',
          'Choose a new password that meets the strength rules shown on the form.',
        ],
      },
      {
        type: 'tip',
        text: 'Password fields include a show/hide control so you can confirm what you typed.',
      },
      {
        type: 'links',
        items: [
          { label: 'Sign in', href: '/login' },
          { label: 'Forgot password', href: '/forgot-password' },
          { label: 'Sign up', href: '/pricing' },
        ],
      },
    ],
  },
  {
    slug: 'staff-documents',
    title: 'Staff, documents, and contractors',
    description: 'Manage people records, compliance documents, and contractor profiles.',
    category: 'features',
    order: 1,
    body: [
      { type: 'heading', text: 'Staff' },
      {
        type: 'paragraph',
        text: 'Staff (Guards) holds employee profiles: personal details, right-to-work / visa information, security compliance fields, address, and employment data. Open a staff member to edit their full profile.',
      },
      { type: 'heading', text: 'Documents' },
      {
        type: 'paragraph',
        text: 'Upload and track staff documents and expiry dates. The Dashboard and alerts panel highlight documents nearing expiry so you can renew them in time.',
      },
      { type: 'heading', text: 'Contractors' },
      {
        type: 'paragraph',
        text: 'Store main and sub-contractor records separately from employed staff. Use contractor profiles for organisations or individuals you deploy alongside your workforce.',
      },
      { type: 'heading', text: 'Attendance' },
      {
        type: 'paragraph',
        text: 'Book staff on and off shifts from Attendance, and review late or missing book-ons. Rota planners can also mark attendance against individual shifts.',
      },
      {
        type: 'links',
        items: [
          { label: 'Book a demo for a walkthrough', href: '/book-demo' },
          { label: 'Platform: workforce', href: '/platform#workforce' },
        ],
      },
    ],
  },
  {
    slug: 'sites-clients-assignments',
    title: 'Sites, clients, and assignments',
    description: 'Locations, client accounts, and shift assignments.',
    category: 'features',
    order: 2,
    body: [
      { type: 'heading', text: 'Sites' },
      {
        type: 'paragraph',
        text: 'Sites are the locations where staff work. Add site details and default hourly rates used for pay and billing when a shift does not override the rate.',
      },
      { type: 'heading', text: 'Clients' },
      {
        type: 'paragraph',
        text: 'Clients store customer accounts and contracts. Link sites and invoices to the right client so billing stays organised.',
      },
      { type: 'heading', text: 'Assignments' },
      {
        type: 'paragraph',
        text: 'Assignments are scheduled shifts for a guard at a site on a date, with start/end times, break minutes, shift type, and optional rate. Publishing a rota creates assignments for attendance, portals, and operational reports. Payroll and invoices read published rota planner data directly — not the Assignments list.',
      },
      {
        type: 'tip',
        text: 'Keep site rates and guard rates up to date under Rates / Allowances so payroll and invoices resolve the correct hourly amount.',
      },
    ],
  },
  {
    slug: 'rotas-shifts',
    title: 'Rotas and shifts',
    description: 'Create, edit, publish, and report on rotas.',
    category: 'features',
    order: 3,
    body: [
      {
        type: 'paragraph',
        text: 'Rotas & Shifts is the planner for weekly (or multi-day) schedules. Draft a rota, place shifts, then publish so they appear as assignments.',
      },
      { type: 'heading', text: 'Create a rota' },
      {
        type: 'steps',
        items: [
          'Open Rotas & Shifts and create a new rota (name, date range, employees).',
          'Use Table or Timeline to place shifts with times, site, break, and rate.',
          'Mark attendance on shifts when needed (for example On time, Late, Absent, No show — where available).',
          'Publish the rota so shifts sync into Assignments.',
        ],
      },
      { type: 'heading', text: 'Useful tools' },
      {
        type: 'bullets',
        items: [
          'Employee custom order — reorder staff rows for the planner session.',
          'Copy shifts between days or employees.',
          'Attendance report — summary export for the rota period.',
          'Legacy grid — older Excel/PDF-style scheduling view still available if you need it.',
        ],
      },
      {
        type: 'tip',
        text: 'Total hours can include or exclude breaks via the “Incl. breaks?” checkbox on the rota grid. Backend pay and invoice hours deduct break minutes from shift duration.',
      },
      {
        type: 'links',
        items: [{ label: 'Platform: rota', href: '/platform#rota' }],
      },
    ],
  },
  {
    slug: 'payroll-invoices',
    title: 'Payroll, invoices, and payments',
    description: 'Calculate pay, bill clients, and record payments.',
    category: 'features',
    order: 4,
    body: [
      { type: 'heading', text: 'Payroll' },
      {
        type: 'paragraph',
        text: 'Import payroll from published rota payable totals (by employee, site, or rota). Hours and amounts come from On time / Late shifts already calculated on the rota — payroll does not recalculate rates. Use Edit on any record to correct hours, rate, allowances, or bank/cash split.',
      },
      { type: 'heading', text: 'Invoices' },
      {
        type: 'paragraph',
        text: 'Generate client invoices from published rota shift hours for a billing period (by client or site). Filter by customer, status, and date; open an invoice to view, edit, duplicate, record payment, export PDF, or delete. Company logo and bank details from Company settings appear on invoices.',
      },
      { type: 'heading', text: 'Payments' },
      {
        type: 'paragraph',
        text: 'Record and track client payments received against invoices.',
      },
      { type: 'heading', text: 'Expenses and allowances' },
      {
        type: 'bullets',
        items: [
          'Expenses — log business expenses and VAT for reporting.',
          'Allowances — configure rates and allowance amounts; mark which feed into payroll.',
        ],
      },
      {
        type: 'links',
        items: [
          { label: 'Platform: payroll', href: '/platform#payroll' },
          { label: 'Platform: invoicing', href: '/platform#invoicing' },
        ],
      },
    ],
  },
  {
    slug: 'leads-client-portal',
    title: 'Leads, client portal, and staff requests',
    description: 'Sales pipeline and client-facing request workflows.',
    category: 'features',
    order: 5,
    body: [
      { type: 'heading', text: 'Leads' },
      {
        type: 'paragraph',
        text: 'When enabled on your plan, Leads manages prospects: list and detail views, follow-ups (today / upcoming), meetings, calendar, and a lead dashboard. Browser notifications can alert you to lead activity.',
      },
      { type: 'heading', text: 'Client portal' },
      {
        type: 'paragraph',
        text: 'Client users can request staff for shifts, review history, and work with invoices from the client portal. Internal teams review incoming requests under Staff requests.',
      },
      {
        type: 'tip',
        text: 'Lead and portal modules depend on your package and enabled modules. If you do not see them, check Billing or ask your ControlOps representative.',
      },
    ],
  },
  {
    slug: 'reports',
    title: 'Reports',
    description: 'Attendance, shifts, overtime, invoices, usage, and custom reports.',
    category: 'features',
    order: 6,
    body: [
      {
        type: 'paragraph',
        text: 'Reports opens a library of operational and finance reports — for example attendance, shift lateness, overtime, early finish, invoices, and usage. Pick a report, set the date range, and export or review on screen.',
      },
      {
        type: 'tip',
        text: 'Compliance and contract-expiry alerts also surface in the header alerts panel and on the Dashboard.',
      },
      {
        type: 'links',
        items: [{ label: 'Platform: reporting', href: '/platform#reporting' }],
      },
    ],
  },
  {
    slug: 'company-billing',
    title: 'Company profile and billing',
    description: 'Branding, contact details, bank info, and your subscription.',
    category: 'account',
    order: 1,
    body: [
      { type: 'heading', text: 'Company profile' },
      {
        type: 'bullets',
        items: [
          'Logo — appears on invoices.',
          'Contact — company name, email, phone, address, registration and VAT numbers.',
          'Banking — account details printed on invoices for payment.',
        ],
      },
      { type: 'heading', text: 'Billing' },
      {
        type: 'paragraph',
        text: 'View your current plan, upgrade (prorated), manage payment methods, and download receipts. Upgrades are supported; downgrades are not available.',
      },
      { type: 'heading', text: 'Special days' },
      {
        type: 'paragraph',
        text: 'Configure bank holidays or double-rate dates that affect scheduling and rates.',
      },
      {
        type: 'links',
        items: [
          { label: 'Pricing', href: '/pricing' },
          { label: 'Contact', href: '/contact' },
        ],
      },
    ],
  },
  {
    slug: 'roles-users',
    title: 'Roles, permissions, and users',
    description: 'Control who can access each part of ControlOps.',
    category: 'account',
    order: 2,
    body: [
      {
        type: 'paragraph',
        text: 'Roles & Permissions has two tabs: Roles and Users.',
      },
      { type: 'heading', text: 'Roles' },
      {
        type: 'bullets',
        items: [
          'Admin is a fixed system role and cannot be renamed or deleted.',
          'Create custom roles and edit their permission matrix.',
          'Assign roles to users so sidebar modules and actions match their job.',
        ],
      },
      { type: 'heading', text: 'Users' },
      {
        type: 'paragraph',
        text: 'Add users with name, email, password, and role. From the users list you can view, edit (name, email, password, role), reset password, or delete a user (subject to your own permissions).',
      },
      {
        type: 'tip',
        text: 'Only grant roles.delete and related permissions to trusted admins.',
      },
    ],
  },
  {
    slug: 'email-sms',
    title: 'Email and SMS settings',
    description: 'Configure outbound email (SMTP) and SMS for your company.',
    category: 'account',
    order: 3,
    body: [
      { type: 'heading', text: 'Email (SMTP)' },
      {
        type: 'paragraph',
        text: 'Under Settings → Email, configure your company’s SMTP so invoices and notifications can send from your account. Typical fields include host, port, username, password, from address, from name, and encryption, plus templates, triggers, and send logs.',
      },
      { type: 'heading', text: 'SMS' },
      {
        type: 'paragraph',
        text: 'Under Settings → SMS, connect Twilio (or your plan’s SMS provider), manage templates and triggers, and review logs. Availability depends on your package.',
      },
      {
        type: 'tip',
        text: 'Test send after saving SMTP credentials before relying on invoice email in production.',
      },
    ],
  },
  {
    slug: 'faq',
    title: 'FAQ and troubleshooting',
    description: 'Common questions about access, plans, and day-to-day use.',
    category: 'faq',
    order: 1,
    body: [
      { type: 'heading', text: 'I cannot sign in' },
      {
        type: 'bullets',
        items: [
          'Confirm the email and password — the error message will say if either is incorrect.',
          'Use Forgot password if you need a reset link.',
          'Check whether you still need to verify email or complete payment.',
        ],
      },
      { type: 'heading', text: 'I do not see a module in the sidebar' },
      {
        type: 'paragraph',
        text: 'Modules are filtered by your role permissions and by enabled package modules (for example Leads, Expenses, Email, SMS). Ask a company Admin to review Roles & Permissions and Billing.',
      },
      { type: 'heading', text: 'Can I downgrade my plan?' },
      {
        type: 'paragraph',
        text: 'No. ControlOps supports upgrades only. Contact us via Book a demo or Contact if you need to discuss options.',
      },
      { type: 'heading', text: 'Where do invoice logos and bank details come from?' },
      {
        type: 'paragraph',
        text: 'Company profile → Logo and Banking tabs. Update them there so new invoices pick up the correct branding and payment instructions.',
      },
      { type: 'heading', text: 'Why do rota hours differ from payroll hours?' },
      {
        type: 'paragraph',
        text: 'The rota grid can show hours with or without breaks. Payroll uses On time / Late planner hours; invoicing uses published rota shift duration minus break minutes. Align the “Incl. breaks?” toggle when comparing totals.',
      },
      { type: 'heading', text: 'Dark mode and language' },
      {
        type: 'paragraph',
        text: 'Use the theme toggle and language switcher (EN / Arabic) in the header. Preference applies across marketing and app chrome.',
      },
    ],
  },
  {
    slug: 'contact-support',
    title: 'Contact and support',
    description: 'How to reach ControlOps for demos and help.',
    category: 'support',
    order: 1,
    body: [
      {
        type: 'paragraph',
        text: 'There is no public support inbox on the website. Use the channels below — the team will follow up using the work email you provide.',
      },
      { type: 'heading', text: 'Book a demo' },
      {
        type: 'paragraph',
        text: 'Best for product walkthroughs, choosing a plan, or discussing requirements. Submit the form on Book a demo with your company details.',
      },
      { type: 'heading', text: 'Contact' },
      {
        type: 'paragraph',
        text: 'The Contact page points you to book a demo, sign in, or view pricing if you already know what you need.',
      },
      {
        type: 'tip',
        text: 'Transactional system mail (password resets, etc.) may come from noreply@controlops.co.uk — that address is not monitored for support replies.',
      },
      {
        type: 'links',
        items: [
          { label: 'Book a demo', href: '/book-demo' },
          { label: 'Contact', href: '/contact' },
          { label: 'Pricing', href: '/pricing' },
          { label: 'Privacy Policy', href: '/privacy' },
          { label: 'Terms of Service', href: '/terms' },
        ],
      },
    ],
  },
];

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

export function getArticlesByCategory(category: HelpCategoryId): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === category).sort((a, b) => a.order - b.order);
}

export function getAllHelpSlugs(): string[] {
  return HELP_ARTICLES.map((a) => a.slug);
}

export function getHelpCategory(id: HelpCategoryId): HelpCategory | undefined {
  return HELP_CATEGORIES.find((c) => c.id === id);
}

function blockSearchText(block: HelpBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
    case 'tip':
      return block.text;
    case 'steps':
    case 'bullets':
      return block.items.join(' ');
    case 'links':
      return block.items.map((i) => i.label).join(' ');
    default:
      return '';
  }
}

export function getArticleSearchText(article: HelpArticle): string {
  const category = getHelpCategory(article.category);
  return [
    article.title,
    article.description,
    category?.title ?? '',
    category?.description ?? '',
    ...article.body.map(blockSearchText),
  ]
    .join(' ')
    .toLowerCase();
}

export function articleMatchesQuery(article: HelpArticle, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return getArticleSearchText(article).includes(q);
}
