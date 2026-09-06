'use client';
import { InlineDetailSkeleton } from '@/components/skeletons';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { can, canModule } from '@/lib/permissions';
import { formatDateUK } from '@/lib/date-format';
import type { Guard } from '@/lib/types';
import { useAuthBlobUrl } from '@/lib/use-auth-blob-url';
import { ArrowLeft, Mail, Phone, Upload } from 'lucide-react';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { DeleteRecordDialog, type DeleteRecordTarget } from '@/components/delete-record-dialog';
import { AbsenceTab } from '@/components/hr/profile/absence-tab';
import { DocumentsTab } from '@/components/hr/profile/documents-tab';
import { EmergenciesTab } from '@/components/hr/profile/emergencies-tab';
import { EmploymentTab } from '@/components/hr/profile/employment-tab';
import { OvertimeTab } from '@/components/hr/profile/overtime-tab';
import { PersonalTab } from '@/components/hr/profile/personal-tab';

/** The tabs from the spec, in its order. */
const TABS = [
  { id: 'absence', label: 'Absence' },
  { id: 'employment', label: 'Employment' },
  { id: 'overtime', label: 'Overtime' },
  { id: 'personal', label: 'Personal' },
  { id: 'emergencies', label: 'Emergencies' },
  { id: 'documents', label: 'Documents' },
] as const;
type ProfileTab = (typeof TABS)[number]['id'];

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value?.trim() ? value : '—'}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</CardContent>
    </Card>
  );
}

function EmployeeProfile() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = typeof params?.id === 'string' ? parseInt(params.id, 10) : NaN;
  const { user } = useAuth();
  const [guard, setGuard] = useState<Guard | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteRecordTarget | null>(null);
  const photoSrc = useAuthBlobUrl(guard?.photo_url);

  // The tab lives in the URL so a link can point straight at, say, someone's documents.
  const urlTab = searchParams.get('tab');
  const [tab, setTab] = useState<ProfileTab>(
    TABS.some((t) => t.id === urlTab) ? (urlTab as ProfileTab) : 'absence'
  );

  const canEdit = can(user, 'guards.write');
  const canSalary = canModule(user, 'guards', 'salary_view');
  const canSensitive = canModule(user, 'guards', 'sensitive_view');
  const canTerminate = canModule(user, 'guards', 'terminate');
  const canDelete = can(user, 'guards.delete');

  const load = useCallback(async () => {
    if (!id || Number.isNaN(id)) return;
    setLoading(true);
    try {
      setGuard(await api.guards.get(id));
    } catch {
      setGuard(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPhoto = async (file: File | null) => {
    if (!file || !guard) return;
    setUploading(true);
    try {
      const updated = await api.guards.uploadPhoto(guard.id, file);
      setGuard(updated);
      toast.success('Photo uploaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const goTab = (next: ProfileTab) => {
    setTab(next);
    router.replace(`/guards/${id}?tab=${next}`, { scroll: false });
  };

  if (!id || Number.isNaN(id)) return null;

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto space-y-6 px-4 py-8">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/guards">
                <ArrowLeft className="mr-2 size-4" />
                Employee hub
              </Link>
            </Button>
            {guard ? (
              <>
                <span>/</span>
                <span className="font-medium text-foreground">{guard.full_name}</span>
                <span>/</span>
                <span className="capitalize">{tab}</span>
              </>
            ) : null}
          </div>

          {loading ? (
            <InlineDetailSkeleton />
          ) : !guard ? (
            <div className="py-12 text-center text-muted-foreground">Staff member not found.</div>
          ) : (
            <>
              <Card>
                <CardContent className="flex flex-wrap items-start gap-6 p-6">
                  <div className="shrink-0">
                    {photoSrc ? (
                      <img src={photoSrc} alt="" className="size-24 rounded-full border bg-muted object-cover" />
                    ) : (
                      <div className="flex size-24 items-center justify-center rounded-full border border-dashed bg-muted/30 text-xs text-muted-foreground">
                        No photo
                      </div>
                    )}
                    {canEdit ? (
                      <label className="mt-2 inline-flex">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)}
                        />
                        <span className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted">
                          <Upload className="mr-1.5 size-3.5" />
                          {uploading ? 'Uploading…' : 'Upload photo'}
                        </span>
                      </label>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-2xl font-bold">{guard.full_name}</h1>
                    <p className="mt-0.5 text-muted-foreground">{guard.job_title || 'Staff member'}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {guard.termination_date ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                          Terminated · {formatDateUK(guard.termination_date)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          Available
                        </span>
                      )}
                      {guard.deleted_at ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">Archived</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {guard.email ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`mailto:${guard.email}`}>
                          <Mail className="mr-1.5 size-3.5" />
                          Email
                        </a>
                      </Button>
                    ) : null}
                    {guard.phone ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`tel:${guard.phone}`}>
                          <Phone className="mr-1.5 size-3.5" />
                          Call
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-1 border-b">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => goTab(t.id)}
                    className={cn(
                      '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                      tab === t.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'absence' ? (
                <AbsenceTab guardId={guard.id} canEdit={canEdit} />
              ) : tab === 'employment' ? (
                <EmploymentTab
                  guard={guard}
                  canEdit={canEdit}
                  canSalary={canSalary}
                  canSensitive={canSensitive}
                  canTerminate={canTerminate}
                  canDelete={canDelete}
                  onSaved={() => void load()}
                  onDelete={() =>
                    setDeleteTarget({
                      id: guard.id,
                      name: guard.full_name,
                      archived: guard.deleted_at != null,
                    })
                  }
                />
              ) : tab === 'overtime' ? (
                <OvertimeTab guardId={guard.id} />
              ) : tab === 'personal' ? (
                <>
                  <PersonalTab guard={guard} canEdit={canEdit} onSaved={() => void load()} />
                  {/* Security-specific fields this product carries that the generic HR
                      tabs have no home for. */}
                  <Section title="Visa &amp; right to work">
                    <Field label="Visa type" value={guard.visa_status} />
                    <Field
                      label="Visa expiry"
                      value={guard.visa_expiry_date ? formatDateUK(guard.visa_expiry_date) : null}
                    />
                    <Field label="RTW status" value={guard.rtw_status} />
                    <Field label="Share code" value={guard.share_code} />
                    <Field
                      label="Share code expiry"
                      value={guard.share_code_expiry_date ? formatDateUK(guard.share_code_expiry_date) : null}
                    />
                  </Section>
                  <Section title="Security &amp; compliance">
                    <Field label="Badge number" value={guard.badge_number} />
                    <Field label="SIA badge number" value={guard.sia_number} />
                    <Field
                      label="SIA expiry"
                      value={guard.sia_expiry_date ? formatDateUK(guard.sia_expiry_date) : null}
                    />
                    <Field label="DBS status" value={guard.dbs_status} />
                    <Field label="Car" value={guard.has_car ? 'Yes' : 'No'} />
                    <Field label="Service area" value={guard.service_area} />
                  </Section>
                </>
              ) : tab === 'emergencies' ? (
                <EmergenciesTab guardId={guard.id} canEdit={canEdit} />
              ) : (
                <DocumentsTab
                  guardId={guard.id}
                  canUpload={canModule(user, 'documents', 'upload')}
                  canDelete={canModule(user, 'documents', 'delete')}
                />
              )}
            </>
          )}
        </div>

        <DeleteRecordDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          noun="staff member"
          archiveHint="Their shifts, attendance and payroll history stay exactly as they are, and any portal login they hold is switched off."
          loadImpact={api.guards.deleteImpact}
          onArchive={async (gid) => {
            await api.guards.delete(gid);
            router.push('/guards');
          }}
          onDeletePermanently={async (gid) => {
            await api.guards.delete(gid, { permanent: true });
            router.push('/guards');
          }}
          canArchive={canDelete}
          canDeletePermanently={canDelete}
        />
      </AppShell>
    </ProtectedRoute>
  );
}

export default function GuardViewPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<InlineDetailSkeleton />}>
      <EmployeeProfile />
    </Suspense>
  );
}
