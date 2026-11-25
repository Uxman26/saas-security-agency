'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
import { PASSWORD_REQUIREMENTS_MSG, passwordFieldSchema } from '@/lib/validation';
import type { PortalLogin } from '@/lib/types';
import { toast } from '@/lib/toast';
import { assertEmailAvailable, DUPLICATE_EMAIL_MESSAGE, isDuplicateEmailError } from '@/lib/email-availability';
import { KeyRound } from 'lucide-react';

type Props = {
  /** Which record's logins to manage. */
  kind: 'client' | 'site' | 'staff';
  recordId: number;
  /** Fetches the logins attached to this record. */
  load: (id: number) => Promise<PortalLogin[]>;
  /** Sets a new password on one of them. */
  save: (id: number, loginUserId: number, newPassword: string) => Promise<PortalLogin>;
  /**
   * Provisions the first login for this record. Omit to keep the read-only empty state
   * that points at Roles & Permissions instead.
   */
  create?: (id: number, data: { email?: string; phone?: string; password: string }) => Promise<PortalLogin>;
  /** Pre-fills the create form's email with the record's own address. */
  defaultEmail?: string;
  /** Staff only: offer signing in with a mobile number, pre-filled with this one. */
  defaultPhone?: string;
};

/** What a login signs in with, as staff would type it. */
function loginIdentity(l: PortalLogin) {
  return l.login_phone || l.email;
}

/**
 * Change the password of the portal login attached to a client or site, from that
 * record's edit dialog.
 *
 * Reading and changing a login is user administration, so it is gated on the same
 * `roles.users_*` rights the Users tab uses rather than on clients.edit / sites.edit.
 * A role that can edit a client but not manage logins simply does not see this panel —
 * the API enforces the same split independently.
 */
export function PortalLoginPanel({ kind, recordId, load, save, create, defaultEmail, defaultPhone }: Props) {
  const { user } = useAuth();
  const canView = canModule(user, 'roles', 'users_view');
  const canReset = canModule(user, 'roles', 'users_reset_password');
  const canCreate = canModule(user, 'roles', 'users_create');

  const [logins, setLogins] = useState<PortalLogin[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [password, setPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [loginWith, setLoginWith] = useState<'email' | 'phone'>('email');
  const [saving, setSaving] = useState(false);
  const allowPhone = kind === 'staff' && defaultPhone !== undefined;

  const refresh = useCallback(() => {
    if (!canView || !recordId) return;
    load(recordId)
      .then((rows) => {
        setLogins(rows);
        setSelectedId(rows.length ? String(rows[0].id) : '');
      })
      .catch(() => setLogins([]));
  }, [canView, recordId, load]);

  useEffect(() => {
    setPassword('');
    refresh();
  }, [refresh]);

  useEffect(() => {
    setNewEmail(defaultEmail ?? '');
    setNewPhone(defaultPhone ?? '');
    setLoginWith('email');
  }, [defaultEmail, defaultPhone, recordId]);

  if (!canView) return null;

  const label = kind === 'client' ? 'client' : kind === 'site' ? 'site' : 'staff member';

  const submit = async () => {
    const loginUserId = parseInt(selectedId, 10);
    if (!loginUserId) return;
    const parsed = passwordFieldSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid password');
      return;
    }
    setSaving(true);
    try {
      await save(recordId, loginUserId, password);
      setPassword('');
      toast.success('Portal password updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update the password');
    } finally {
      setSaving(false);
    }
  };

  const submitCreate = async () => {
    if (!create) return;
    const byPhone = allowPhone && loginWith === 'phone';
    const email = newEmail.trim();
    const phone = newPhone.trim();
    if (byPhone ? !/^\+?[\d\s().-]{9,20}$/.test(phone) : !email) {
      toast.error(byPhone ? 'Enter a valid mobile number for the login' : 'An email address is required for the login');
      return;
    }
    const parsed = passwordFieldSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid password');
      return;
    }
    setSaving(true);
    try {
      if (!byPhone) {
        const dup = await assertEmailAvailable(email);
        if (dup) {
          toast.error(dup);
          return;
        }
      }
      await create(recordId, byPhone ? { phone, password } : { email, password });
      setPassword('');
      toast.success('Portal login created');
      refresh();
    } catch (e) {
      toast.error(
        isDuplicateEmailError(e)
          ? DUPLICATE_EMAIL_MESSAGE
          : e instanceof Error
            ? e.message
            : 'Failed to create the login'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" />
        <Label className="font-medium">Portal login password</Label>
      </div>

      {logins === null ? (
        <p className="text-xs text-muted-foreground">Loading logins…</p>
      ) : logins.length === 0 ? (
        create && canCreate ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              This {label} has no portal login yet. Set one up here.
            </p>
            {allowPhone ? (
              <div className="flex gap-2 pb-1" role="radiogroup" aria-label="Signs in with">
                {(
                  [
                    ['email', 'Email address'],
                    ['phone', 'Mobile number'],
                  ] as const
                ).map(([value, text]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    role="radio"
                    aria-checked={loginWith === value}
                    variant={loginWith === value ? 'default' : 'outline'}
                    onClick={() => setLoginWith(value)}
                  >
                    {text}
                  </Button>
                ))}
              </div>
            ) : null}
            {allowPhone && loginWith === 'phone' ? (
              <>
                <Label htmlFor={`portal-new-phone-${kind}-${recordId}`} className="text-xs">
                  Login mobile number
                </Label>
                <Input
                  id={`portal-new-phone-${kind}-${recordId}`}
                  type="tel"
                  autoComplete="username"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="07700 900123"
                />
              </>
            ) : (
              <>
                <Label htmlFor={`portal-new-email-${kind}-${recordId}`} className="text-xs">
                  Login email
                </Label>
                <Input
                  id={`portal-new-email-${kind}-${recordId}`}
                  type="email"
                  autoComplete="username"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </>
            )}
            <Label htmlFor={`portal-new-password-${kind}-${recordId}`} className="text-xs">
              Password
            </Label>
            <PasswordInput
              id={`portal-new-password-${kind}-${recordId}`}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set a password"
            />
            <p className="text-xs text-muted-foreground">{PASSWORD_REQUIREMENTS_MSG}</p>
            <p className="text-xs text-muted-foreground">
              {allowPhone && loginWith === 'phone'
                ? 'They sign in with this mobile number, your Company ID and the password. If the number already has a ControlOps login at another company, they keep that password.'
                : 'If this email already has a ControlOps login at another company, they keep that password and sign in with this company\u2019s Company ID.'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || !password || !(allowPhone && loginWith === 'phone' ? newPhone.trim() : newEmail.trim())}
              onClick={() => void submitCreate()}
            >
              {saving ? 'Creating…' : 'Create portal login'}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            This {label} has no portal login yet. Create one in Settings → Roles &amp; Permissions →
            Users.
          </p>
        )
      ) : (
        <>
          {logins.length > 1 ? (
            <div className="space-y-1">
              <Label className="text-xs">Login</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select login" />
                </SelectTrigger>
                <SelectContent>
                  {logins.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {loginIdentity(l)}
                      {l.full_name ? ` · ${l.full_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Signs in as <span className="font-medium text-foreground">{loginIdentity(logins[0])}</span>
              {logins[0].is_active ? '' : ' (account disabled)'}
            </p>
          )}

          {canReset ? (
            <div className="space-y-1">
              <Label htmlFor={`portal-password-${kind}-${recordId}`} className="text-xs">
                New password
              </Label>
              {/* Paired with the login email so password managers offer the right entry. */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={loginIdentity(logins.find((l) => String(l.id) === selectedId) ?? logins[0])}
                readOnly
                tabIndex={-1}
                aria-hidden
                className="sr-only"
              />
              <PasswordInput
                id={`portal-password-${kind}-${recordId}`}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter a new password"
              />
              <p className="text-xs text-muted-foreground">{PASSWORD_REQUIREMENTS_MSG}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || !password || !selectedId}
                onClick={() => void submit()}
              >
                {saving ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              You do not have permission to change login passwords.
            </p>
          )}
        </>
      )}
    </div>
  );
}
