'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { signupSchema } from '@/lib/validation';
import { api } from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: { email: string; password: string; full_name: string; company_name: string }) => {
    setError('');
    setLoading(true);
    try {
      await api.auth.signup(data);
      router.push('/login');
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5 dark:to-primary/10">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,var(--primary)/15%,transparent)]" />
      <Card className="relative w-full max-w-md shadow-xl border-primary/10 dark:border-primary/20 bg-card/95 dark:bg-card">
        <CardHeader className="space-y-1 text-center pb-2">
          <CardTitle className="text-2xl">Create account</CardTitle>
          <CardDescription>Register your company to get started</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input id="full_name" placeholder="John Smith" {...register('full_name')} />
              {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message as string}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@company.com" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message as string}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input id="company_name" placeholder="Acme Security Ltd" {...register('company_name')} />
              {errors.company_name && <p className="text-sm text-destructive">{errors.company_name.message as string}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...register('password')} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message as string}</p>}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{' '}
              <a href="/login" className="text-primary font-medium hover:underline">
                Sign in
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
