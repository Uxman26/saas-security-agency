'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { Mail } from 'lucide-react';
import { toast } from '@/lib/toast';

const emailSchema = z.object({
  to_email: z.string().email('Invalid email address'),
  subject: z.string().min(1, 'Subject is required').max(200),
  body: z.string().min(1, 'Message is required'),
});

export function EmailDialog({ defaultEmail, defaultName }: { defaultEmail?: string; defaultName?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

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
      toast.success('Email sent');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="h-4 w-4 mr-2" />
          Send Email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Email{defaultName ? ` to ${defaultName}` : ''}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>To Email</Label>
            <Input type="email" {...register('to_email')} />
            {errors.to_email && <p className="text-sm text-destructive">{errors.to_email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input {...register('subject')} />
            {errors.subject && <p className="text-sm text-destructive">{errors.subject.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <textarea
              {...register('body')}
              className="w-full min-h-[200px] px-3 py-2 border rounded-md"
              placeholder="Enter your message here..."
            />
            {errors.body && <p className="text-sm text-destructive">{errors.body.message}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send Email'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
