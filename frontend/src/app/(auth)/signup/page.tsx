'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AuthShell } from '@/components/auth-shell';
import { OAuthButtons } from '@/components/oauth-buttons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ApiError, api } from '@/lib/api';

/** Mirrors the backend policy (§6): length over composition rules. */
const schema = z.object({
  fullName: z.string().trim().max(255).optional(),
  email: z.string().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z
    .string()
    .min(12, 'Use at least 12 characters')
    .max(256, 'That password is too long'),
});

type Values = z.infer<typeof schema>;

export default function SignupPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', password: '' },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await api.signup({
        email: values.email,
        password: values.password,
        ...(values.fullName ? { fullName: values.fullName } : {}),
      });
      // The response is identical whether or not the address was taken, so
      // this screen must be too — showing "check your email" either way is
      // the whole point of the enumeration-safe contract (§4).
      setSent(true);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    }
  }

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle="We sent you a verification link.">
        <div className="grid gap-4">
          <div className="border-border/60 bg-muted/30 flex items-start gap-3 rounded-lg border p-4">
            <MailCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" aria-hidden />
            <p className="text-muted-foreground text-sm">
              Open the link in <span className="text-foreground">{form.getValues('email')}</span> to
              activate your account. The link is valid for 24 hours.
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create an account"
      subtitle="Five scans a day on the free plan."
      footer={
        <span className="text-muted-foreground">
          Already have one?{' '}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </span>
      }
    >
      <OAuthButtons />

      <div className="my-5 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">or</span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <div className="grid gap-2">
          <Label htmlFor="fullName">Name (optional)</Label>
          <Input id="fullName" autoComplete="name" {...form.register('fullName')} />
        </div>

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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...form.register('password')}
          />
          <p className="text-muted-foreground text-xs">
            At least 12 characters. Checked against known breach corpora.
          </p>
          {form.formState.errors.password ? (
            <p className="text-destructive text-xs">{form.formState.errors.password.message}</p>
          ) : null}
        </div>

        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}
