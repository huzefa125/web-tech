'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { setSessionLostHandler } from '@/lib/api';
import { useAuth } from '@/stores/auth';

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const restore = useAuth((s) => s.restore);
  const clear = useAuth((s) => s.clear);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The client already retries once behind a token refresh; retrying
            // again on top of that just multiplies a real outage.
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    // §7: recover the session on mount rather than trusting any client state.
    void restore();
  }, [restore]);

  useEffect(() => {
    setSessionLostHandler(() => {
      clear();
      queryClient.clear();
      router.push('/login');
    });
    return () => setSessionLostHandler(null);
  }, [clear, queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
