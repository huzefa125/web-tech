'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/stores/auth';

/**
 * Client-side route guard.
 *
 * auth-requirements.md §7 suggests a Next.js middleware checking the refresh
 * cookie's presence, but that cannot work as specified: §3.1 scopes the cookie
 * to `Path=/api/v1/auth`, and in production the API is a different host, so the
 * browser never sends it to the Next.js server. The same section's other
 * instruction — "on app mount, call /auth/refresh; on failure, treat as logged
 * out" — is what actually holds, and is what this implements.
 *
 * Presence of a session is a UX concern either way. The API is the authority
 * on every request, so a user who defeats this guard sees an empty shell.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
