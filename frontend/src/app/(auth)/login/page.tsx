'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { AuthShell } from '@/components/auth-shell';
import { OAuthButtons } from '@/components/oauth-buttons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/stores/auth';

const schema = z.object({
  email: z.string().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

type Values = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const setSession = useAuth((s) => s.setSession);

  /** Set when the account exists but is unverified, so we can offer a resend. */
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    setUnverifiedEmail(null);

    try {
      const session = await api.login(values);
      setSession(session.user, session.accessToken);
      router.push(params.get('redirect_to') ?? '/dashboard');
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setFormError('Something went wrong. Please try again.');
        return;
      }

      // The backend distinguishes these deliberately; surfacing the code
      // rather than one generic message is what makes the flow recoverable.
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(values.email);
        return;
      }
      setFormError(err.message);
    }
  }

  async function resend() {
    if (!unverifiedEmail) return;
    await api.resendVerification(unverifiedEmail);
    toast.success('If that address needs verification, we sent a new link.');
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Scan any site and track how it changes."
      footer={
        <span className="text-muted-foreground">
          No account?{' '}
          <Link href="/signup" className="text-foreground underline underline-offset-4">
            Create one
          </Link>
        </span>
      }
    >
      <OAuthButtons redirectTo={params.get('redirect_to') ?? undefined} />

      <div className="my-5 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">or</span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            {...form.register('email')}
          />
          {form.formState.errors.email ? (
            <p className="text-destructive text-xs">{form.formState.errors.email.message}</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
            >
              Forgot?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
          {form.formState.errors.password ? (
            <p className="text-destructive text-xs">{form.formState.errors.password.message}</p>
          ) : null}
        </div>

        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        {unverifiedEmail ? (
          <Alert>
            <AlertDescription className="space-y-2">
              <p>Verify your email address before signing in.</p>
              <Button type="button" variant="secondary" size="sm" onClick={resend}>
                Resend verification link
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary to avoid opting the whole route
  // into client-side rendering at build time.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
