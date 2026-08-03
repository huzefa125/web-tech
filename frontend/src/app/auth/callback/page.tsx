'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/stores/auth';

/**
 * Where the backend lands the browser after an OAuth round-trip.
 *
 * The backend has already set the refresh cookie; no access token comes back
 * in the URL — deliberately, since anything in a query string ends up in
 * history and server logs. So the only job here is to run the normal session
 * restore and move on.
 */
function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const restore = useAuth((s) => s.restore);

  const error = params.get('error');
  const message = params.get('message');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (error) return;

    void (async () => {
      await restore();
      // Read the store directly: the closure captured `user` before restore ran.
      if (useAuth.getState().user) {
        router.replace(params.get('redirect_to') ?? '/dashboard');
      } else {
        setFailed(true);
      }
    })();
  }, [error, params, restore, router]);

  if (error || failed) {
    return (
      <AuthShell
        title="Sign-in failed"
        subtitle={message ?? 'We could not complete that sign-in.'}
      >
        <Button asChild variant="secondary" className="w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Signing you in">
      <div className="grid gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </AuthShell>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
