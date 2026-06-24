'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow } from '@/components/marketing/marketing-cta';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { INDUSTRY_VALUES, WORKFORCE_VALUES } from '@/lib/industry-options';
import { authFieldClass, authLabelClass, authSelectClass } from '@/lib/auth-styles';
import { Loader2 } from 'lucide-react';

const schema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  company_name: z.string().min(2),
  industry: z.string().min(1),
  workforce_size: z.string().min(1),
  challenge: z.string().min(10),
  phone: z.string().optional(),
  current_system: z.string().optional(),
  preferred_time: z.string().optional(),
});

export default function BookDemoPage() {
  const t = useTranslations('marketing.bookDemo');
  const ta = useTranslations('auth');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const industryLabels = t.raw('industries') as string[];
  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setLoading(true);
    try {
      await api.marketing.requestDemo(data);
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ta('requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-xl">
          <Eyebrow>{t('badge')}</Eyebrow>
          <h1 className="text-3xl md:text-4xl font-bold">{t('title')}</h1>
          <p className="mt-4 text-muted-foreground">{t('intro')}</p>
          {done ? (
            <div className="mt-10 rounded-xl border bg-card p-8 text-center">
              <p className="text-lg font-medium">{t('success')}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="mt-10 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="full_name" className={authLabelClass}>{t('fullName')}</Label>
                <Input id="full_name" className={authFieldClass} {...register('full_name')} />
                {errors.full_name && <p className="text-sm text-destructive">{ta('required')}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className={authLabelClass}>{t('workEmail')}</Label>
                <Input id="email" type="email" className={authFieldClass} {...register('email')} />
                {errors.email && <p className="text-sm text-destructive">{ta('validEmailRequired')}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_name" className={authLabelClass}>{t('companyName')}</Label>
                <Input id="company_name" className={authFieldClass} {...register('company_name')} />
              </div>
              <div className="space-y-2">
                <Label className={authLabelClass}>{t('industry')}</Label>
                <Select onValueChange={(v) => setValue('industry', v)}>
                  <SelectTrigger className={authSelectClass}><SelectValue placeholder={ta('selectIndustry')} /></SelectTrigger>
                  <SelectContent>
                    {INDUSTRY_VALUES.map((v, i) => (
                      <SelectItem key={v} value={v}>{industryLabels[i] ?? v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.industry && <p className="text-sm text-destructive">{ta('required')}</p>}
              </div>
              <div className="space-y-2">
                <Label className={authLabelClass}>{t('workforceSize')}</Label>
                <Select onValueChange={(v) => setValue('workforce_size', v)}>
                  <SelectTrigger className={authSelectClass}><SelectValue placeholder={ta('selectSize')} /></SelectTrigger>
                  <SelectContent>
                    {WORKFORCE_VALUES.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="challenge" className={authLabelClass}>{t('challenge')}</Label>
                <Textarea id="challenge" rows={4} className={authFieldClass} {...register('challenge')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className={authLabelClass}>{t('phone')}</Label>
                <Input id="phone" className={authFieldClass} {...register('phone')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="current_system" className={authLabelClass}>{t('currentSystem')}</Label>
                <Input id="current_system" className={authFieldClass} {...register('current_system')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preferred_time" className={authLabelClass}>{t('preferredTime')}</Label>
                <Input id="preferred_time" className={authFieldClass} {...register('preferred_time')} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : t('submit')}
              </Button>
            </form>
          )}
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
