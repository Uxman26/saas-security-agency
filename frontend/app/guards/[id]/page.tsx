'use client';
import { InlineDetailSkeleton } from '@/components/skeletons';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatDateUK } from '@/lib/date-format';
import type { Guard } from '@/lib/types';
import { useAuthBlobUrl } from '@/lib/use-auth-blob-url';
import { ArrowLeft, Pencil, Upload } from 'lucide-react';
import { toast } from '@/lib/toast';

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
      <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</CardContent>
    </Card>
  );
}

export default function GuardViewPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? parseInt(params.id, 10) : NaN;
  const { user } = useAuth();
  const [guard, setGuard] = useState<Guard | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const photoSrc = useAuthBlobUrl(guard?.photo_url);

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

  if (!id || Number.isNaN(id)) return null;

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-wrap gap-3 items-center">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/guards">
                <ArrowLeft className="size-4 mr-2" />
                Back
              </Link>
            </Button>
            {guard && can(user, 'guards.write') && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/guards">
                  <Pencil className="size-4 mr-2" />
                  Edit from list
                </Link>
              </Button>
            )}
          </div>

          {loading ? (
            <InlineDetailSkeleton />
          ) : !guard ? (
            <div className="text-center py-12 text-muted-foreground">Staff member not found.</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-6 items-start">
                <div className="shrink-0">
                  {photoSrc ? (
                    <img src={photoSrc} alt="" className="size-24 rounded-full object-cover border bg-muted" />
                  ) : (
                    <div className="size-24 rounded-full border border-dashed flex items-center justify-center text-xs text-muted-foreground bg-muted/30">
                      No photo
                    </div>
                  )}
                  {can(user, 'guards.write') && (
                    <label className="mt-2 inline-flex">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)}
                      />
                      <span className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 h-8 text-xs font-medium hover:bg-muted cursor-pointer">
                        <Upload className="size-3.5 mr-1.5" />
                        {uploading ? 'Uploading…' : 'Upload photo'}
                      </span>
                    </label>
                  )}
                </div>
                <div>
                  <h1 className="text-3xl font-bold">{guard.full_name}</h1>
                  <p className="text-muted-foreground mt-1">{guard.job_title || 'Staff member'}</p>
                </div>
              </div>

              <Section title="Personal details">
                <Field label="Date of birth" value={guard.date_of_birth ? formatDateUK(guard.date_of_birth) : null} />
                <Field label="Email" value={guard.email} />
                <Field label="Mobile" value={guard.phone} />
                <Field label="Work phone" value={guard.work_phone} />
                <Field label="Postcode" value={guard.postcode} />
                <Field label="Car" value={guard.has_car ? 'Yes' : 'No'} />
                <Field label="Service area" value={guard.service_area} />
                <Field label="Nearby areas" value={guard.nearby_areas} />
              </Section>

              <Section title="Visa & right to work">
                <Field label="Visa type" value={guard.visa_status} />
                <Field label="Visa expiry" value={guard.visa_expiry_date ? formatDateUK(guard.visa_expiry_date) : null} />
                <Field label="RTW status" value={guard.rtw_status} />
                <Field label="Share code" value={guard.share_code} />
                <Field label="Share code expiry" value={guard.share_code_expiry_date ? formatDateUK(guard.share_code_expiry_date) : null} />
              </Section>

              <Section title="Security & compliance">
                <Field label="Badge number" value={guard.badge_number} />
                <Field label="SIA badge number" value={guard.sia_number} />
                <Field label="SIA expiry" value={guard.sia_expiry_date ? formatDateUK(guard.sia_expiry_date) : null} />
                <Field label="DBS status" value={guard.dbs_status} />
              </Section>

              <Section title="Address">
                <Field label="Address" value={[guard.address_line_1, guard.address_line_2, guard.address_line_3, guard.town_city, guard.county, guard.postcode].filter(Boolean).join(', ') || guard.address} />
              </Section>

              <Section title="Employment">
                <Field label="Employment start" value={guard.employment_start_date ? formatDateUK(guard.employment_start_date) : null} />
                <Field label="Probation end" value={guard.probation_end_date ? formatDateUK(guard.probation_end_date) : null} />
                <Field label="Pay frequency" value={guard.pay_frequency} />
                <Field label="Available days" value={guard.available_days} />
                <Field label="Preferred timing" value={guard.availability_timing} />
              </Section>
            </>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
