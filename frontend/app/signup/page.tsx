'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/auth/auth-shell';
import { signupSchema } from '@/lib/validation';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Building2, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tierParam = searchParams.get('tier');
  const subscription_tier = tierParam || undefined;
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: { email: string; password: string; full_name: string; company_name: string }) => {
    setLoading(true);
    try {
      const res = await api.auth.signup({ ...data, subscription_tier });
      toast.success('Account created — complete payment to activate');
      router.push(`/payment-pending?ref=${encodeURIComponent(res.receipt.ref_id)}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle={
        subscription_tier
          ? `Start with the ${subscription_tier} plan on ControlOps`
          : 'Register your company on ControlOps'
      }
      topLink={{ href: '/login', label: 'Sign in' }}
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-[#FD6203] hover:text-[#DF3C01]">
            Sign in
          </Link>
          {' · '}
          <Link href="/pricing" className="font-semibold text-[#FD6203] hover:text-[#DF3C01]">
            View plans
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="full_name" className="text-[#161E2C] font-medium">
            Full name
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#9CA3AF]" />
            <Input
              id="full_name"
              placeholder="John Smith"
              className="pl-10 h-11 border-[#E5E7EB] focus-visible:ring-[#FD8018] focus-visible:border-[#FD6203]"
              {...register('full_name')}
            />
          </div>
          {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message as string}</p>}
        </div>
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
        <div className="space-y-2">
          <Label htmlFor="company_name" className="text-[#161E2C] font-medium">
            Company name
          </Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#9CA3AF]" />
            <Input
              id="company_name"
              placeholder="Acme Security Ltd"
              className="pl-10 h-11 border-[#E5E7EB] focus-visible:ring-[#FD8018] focus-visible:border-[#FD6203]"
              {...register('company_name')}
            />
          </div>
          {errors.company_name && <p className="text-sm text-destructive">{errors.company_name.message as string}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-[#161E2C] font-medium">
            Password
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#9CA3AF]" />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a password"
              className="pl-10 pr-10 h-11 border-[#E5E7EB] focus-visible:ring-[#FD8018] focus-visible:border-[#FD6203]"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#161E2C]"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-destructive">{errors.password.message as string}</p>}
        </div>
        <Button
          type="submit"
          className="w-full h-11 bg-[#FD6203] hover:bg-[#DF3C01] text-white font-semibold shadow-sm mt-2"
          disabled={loading}
        >
          {loading ? 'Creating account...' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] text-[#161E2C]">Loading...</div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
