'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api } from '@/lib/api';

type State = { kind: 'pending' } | { kind: 'ok' } | { kind: 'error'; message: string };

function Verify() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>({ kind: 'pending' });

  // Verification consumes a single-use token, so it must fire exactly once —
  // React's development double-effect would otherwise spend it and report the
  // second call's "already used" as the outcome.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (!token) {
      setState({ kind: 'error', message: 'This verification link is missing its token.' });
      return;
    }

    api
      .verifyEmail(token)
      .then(() => setState({ kind: 'ok' }))
      .catch((err: unknown) =>
        setState({
          kind: 'error',
          message:
            err instanceof ApiError ? err.message : 'Could not verify this link. Please try again.',
        }),
      );
  }, [token]);

  if (state.kind === 'pending') {
    return (
      <AuthShell title="Verifying your email">
        <div className="grid gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </AuthShell>
    );
  }

  if (state.kind === 'ok') {
    return (
      <AuthShell title="Email verified" subtitle="Your account is ready.">
        <div className="grid gap-4">
          <div className="border-border/60 bg-muted/30 flex items-center gap-3 rounded-lg border p-4">
            <CheckCircle2 className="size-5 text-emerald-400" aria-hidden />
            <p className="text-muted-foreground text-sm">You can sign in now.</p>
          </div>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Could not verify" subtitle={state.message}>
      <div className="grid gap-4">
        <div className="border-destructive/40 bg-destructive/10 flex items-center gap-3 rounded-lg border p-4">
          <XCircle className="text-destructive size-5" aria-hidden />
          <p className="text-muted-foreground text-sm">
            Links expire after 24 hours and can only be used once.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
