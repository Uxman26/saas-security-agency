'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/auth/auth-shell';
import { forgotPasswordSchema } from '@/lib/validation';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { ArrowLeft, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: { email: string }) => {
    setLoading(true);
    try {
      await api.auth.forgotPassword(data.email);
      setSent(true);
      toast.success('Check your email for a reset link');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Forgot password?"
      subtitle={
        sent
          ? `If an account exists for ${getValues('email')}, we sent a reset link.`
          : 'Enter your email and we will send you a reset link.'
      }
      topLink={{ href: '/login', label: 'Back to sign in' }}
    >
      {!sent ? (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[#161E2C] font-medium">
              Work email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#9CA3AF]" />
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                className="pl-10 h-11 border-[#E5E7EB] focus-visible:ring-[#FD8018] focus-visible:border-[#FD6203]"
                {...register('email')}
              />
            </div>
            {errors.email && <p className="text-sm text-destructive">{errors.email.message as string}</p>}
          </div>
          <Button
            type="submit"
            className="w-full h-11 bg-[#FD6203] hover:bg-[#DF3C01] text-white font-semibold"
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </Button>
        </form>
      ) : (
        <Button asChild className="w-full h-11 bg-[#FD6203] hover:bg-[#DF3C01] text-white font-semibold">
          <Link href="/login">Back to sign in</Link>
        </Button>
      )}
      <Link
        href="/login"
        className="mt-6 flex items-center justify-center gap-1 text-sm text-[#4B5563] hover:text-[#161E2C]"
      >
        <ArrowLeft className="size-4" />
        Back to login
      </Link>
    </AuthShell>
  );
}
