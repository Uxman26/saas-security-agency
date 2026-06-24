'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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

const INDUSTRIES = [
  'Security',
  'Cleaning & Facilities',
  'Event Staffing',
  'Temporary Staffing',
  'Other Shift-based Service Business',
];

const WORKFORCE = ['1–19', '20–49', '50–199', '200–999', '1000+'];

export default function BookDemoPage() {
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setLoading(true);
    try {
      await api.marketing.requestDemo(data);
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-xl">
          <Eyebrow>Book a ControlOps demonstration</Eyebrow>
          <h1 className="text-3xl md:text-4xl font-bold">See how ControlOps fits your operation</h1>
          <p className="mt-4 text-muted-foreground">
            Tell us how you currently manage your workforce, locations and shifts. We will show the most relevant ControlOps workflows without giving you a generic presentation.
          </p>
          {done ? (
            <div className="mt-10 rounded-xl border bg-card p-8 text-center">
              <p className="text-lg font-medium">Thank you. We have received your request and will contact you to arrange your ControlOps demonstration.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="mt-10 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input id="full_name" {...register('full_name')} />
                {errors.full_name && <p className="text-sm text-destructive">Required</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email && <p className="text-sm text-destructive">Valid email required</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_name">Company name</Label>
                <Input id="company_name" {...register('company_name')} />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Select onValueChange={(v) => setValue('industry', v)}>
                  <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.industry && <p className="text-sm text-destructive">Required</p>}
              </div>
              <div className="space-y-2">
                <Label>Approximate workforce size</Label>
                <Select onValueChange={(v) => setValue('workforce_size', v)}>
                  <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                  <SelectContent>
                    {WORKFORCE.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="challenge">Main operational challenge</Label>
                <Textarea id="challenge" rows={4} {...register('challenge')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number (optional)</Label>
                <Input id="phone" {...register('phone')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="current_system">Current system or process (optional)</Label>
                <Input id="current_system" {...register('current_system')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preferred_time">Preferred demonstration time (optional)</Label>
                <Input id="preferred_time" {...register('preferred_time')} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : 'Request my demo'}
              </Button>
            </form>
          )}
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
