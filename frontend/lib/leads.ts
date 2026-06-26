export const LEAD_PRIORITIES = ['immediate', 'hot', 'moderate', 'cold'] as const;

export const LEAD_SOURCES = ['website', 'referral', 'cold_call', 'email', 'social', 'event', 'other'] as const;

export const LEAD_DESIGNATIONS = [
  'general_manager',
  'receptionist',
  'front_desk',
  'duty_manager',
  'operations_manager',
  'director',
  'owner',
  'cluster_manager',
  'senior_manager',
] as const;

export type LeadFormState = {
  organization: string;
  contact_name: string;
  designation: string;
  phone: string;
  phone_secondary: string;
  email: string;
  email_secondary: string;
  city: string;
  postcode: string;
  comments: string;
  source: string;
  status: string;
  priority: string;
  estimated_value: string;
  follow_up_date: string;
  meeting_date: string;
};

export const emptyLeadForm = (): LeadFormState => ({
  organization: '',
  contact_name: '',
  designation: '',
  phone: '',
  phone_secondary: '',
  email: '',
  email_secondary: '',
  city: '',
  postcode: '',
  comments: '',
  source: 'cold_call',
  status: 'new',
  priority: 'moderate',
  estimated_value: '',
  follow_up_date: '',
  meeting_date: '',
});

export function leadLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function designationLabel(d: string) {
  const map: Record<string, string> = {
    general_manager: 'General Manager',
    receptionist: 'Receptionist',
    front_desk: 'Front Desk',
    duty_manager: 'Duty Manager',
    operations_manager: 'Operations Manager',
    director: 'Director',
    owner: 'Owner',
    cluster_manager: 'Cluster Manager',
    senior_manager: 'Senior Manager',
  };
  return map[d] || leadLabel(d);
}

export function priorityLabel(p: string) {
  const map: Record<string, string> = {
    immediate: 'Immediate',
    hot: 'Hot',
    moderate: 'Moderate',
    cold: 'Cold',
    low: 'Cold',
    medium: 'Moderate',
    high: 'Hot',
  };
  return map[p] || leadLabel(p);
}

export function statusClass(s: string) {
  if (s === 'won') return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300';
  if (s === 'lost') return 'bg-red-500/15 text-red-800 dark:text-red-300';
  if (s === 'on_hold') return 'bg-slate-500/15';
  if (s === 'follow_up') return 'bg-violet-500/15 text-violet-800 dark:text-violet-300';
  if (s === 'meeting') return 'bg-sky-500/15 text-sky-800 dark:text-sky-300';
  if (['qualified', 'proposal_sent', 'negotiation'].includes(s)) return 'bg-blue-500/15 text-blue-800 dark:text-blue-300';
  return 'bg-amber-500/15 text-amber-900 dark:text-amber-200';
}

export function priorityClass(p: string) {
  if (p === 'immediate') return 'text-red-600 font-medium';
  if (p === 'hot' || p === 'high') return 'text-orange-600';
  if (p === 'cold' || p === 'low') return 'text-slate-500';
  return '';
}

export function toDatetimeLocal(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formFromLead(lead: {
  organization?: string | null;
  title?: string;
  contact_name?: string | null;
  designation?: string | null;
  phone?: string | null;
  phone_secondary?: string | null;
  email?: string | null;
  email_secondary?: string | null;
  city?: string | null;
  postcode?: string | null;
  comments?: string | null;
  source?: string | null;
  status?: string;
  priority?: string | null;
  estimated_value?: number;
  next_follow_up_at?: string | null;
  meeting_at?: string | null;
}): LeadFormState {
  const priority = lead.priority === 'low' ? 'cold' : lead.priority === 'medium' ? 'moderate' : lead.priority === 'high' ? 'hot' : lead.priority || 'moderate';
  return {
    organization: lead.organization || lead.title || '',
    contact_name: lead.contact_name || '',
    designation: lead.designation || '',
    phone: lead.phone || '',
    phone_secondary: lead.phone_secondary || '',
    email: lead.email || '',
    email_secondary: lead.email_secondary || '',
    city: lead.city || '',
    postcode: lead.postcode || '',
    comments: lead.comments || '',
    source: lead.source || 'cold_call',
    status: lead.status || 'new',
    priority,
    estimated_value: lead.estimated_value ? String(lead.estimated_value) : '',
    follow_up_date: toDatetimeLocal(lead.next_follow_up_at),
    meeting_date: toDatetimeLocal(lead.meeting_at),
  };
}

export function payloadFromForm(form: LeadFormState, force_duplicate?: boolean) {
  const payload: Record<string, unknown> = {
    organization: form.organization.trim(),
    title: form.organization.trim(),
    contact_name: form.contact_name || undefined,
    designation: form.designation || undefined,
    phone: form.phone || undefined,
    phone_secondary: form.phone_secondary || undefined,
    email: form.email || undefined,
    email_secondary: form.email_secondary || undefined,
    city: form.city || undefined,
    postcode: form.postcode || undefined,
    comments: form.comments || undefined,
    source: form.source,
    status: form.status,
    priority: form.priority,
    estimated_value: parseFloat(form.estimated_value) || 0,
    force_duplicate: force_duplicate,
  };
  if (form.status === 'follow_up' && form.follow_up_date) {
    payload.next_follow_up_at = new Date(form.follow_up_date).toISOString();
  }
  if (form.status === 'meeting' && form.meeting_date) {
    payload.meeting_at = new Date(form.meeting_date).toISOString();
  }
  return payload;
}
