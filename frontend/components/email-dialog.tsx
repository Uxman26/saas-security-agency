'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { Mail } from 'lucide-react';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

export function EmailDialog({
  defaultEmail,
  defaultName,
  compact,
}: {
  defaultEmail?: string;
  defaultName?: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const t = useTranslations('app');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const emailSchema = z.object({
    to_email: z.string().email(),
    subject: z.string().min(1).max(200),
    body: z.string().min(1),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      to_email: defaultEmail || '',
      subject: '',
      body: '',
    },
  });

  if (user?.enabled_modules && user.enabled_modules.email === false) return null;

  const onSubmit = async (data: { to_email: string; subject: string; body: string }) => {
    setLoading(true);
    try {
      await api.email.send(data);
      setOpen(false);
      reset();
      toast.success(t('emailSent'));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('emailFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={compact ? 'ghost' : 'outline'}
          size="sm"
          title={t('emailDialogTitle')}
          aria-label={t('emailDialogTitle')}
          className={cn(
            compact ? 'size-8 p-0' : 'px-2.5 sm:px-3',
            'transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary'
          )}
        >
          <Mail className={compact ? 'size-4' : 'h-4 w-4 sm:me-2'} />
          {!compact && <span className="sr-only sm:not-sr-only">{tc('sendEmail')}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {defaultName ? t('emailToName', { name: defaultName }) : t('emailDialogTitle')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('emailTo')}</Label>
            <Input type="email" {...register('to_email')} />
            {errors.to_email && <p className="text-sm text-destructive">{errors.to_email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>{t('emailSubject')}</Label>
            <Input {...register('subject')} />
            {errors.subject && <p className="text-sm text-destructive">{errors.subject.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>{t('emailMessage')}</Label>
            <textarea
              {...register('body')}
              className="w-full min-h-[200px] px-3 py-2 border rounded-md"
              placeholder={t('emailPlaceholder')}
            />
            {errors.body && <p className="text-sm text-destructive">{errors.body.message}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('emailSending') : tc('sendEmail')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
