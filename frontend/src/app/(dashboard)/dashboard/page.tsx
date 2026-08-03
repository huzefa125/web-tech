'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { ScanStatusBadge, isPending } from '@/components/scan-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api } from '@/lib/api';

function relative(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');

  const quota = useQuery({ queryKey: ['quota'], queryFn: api.quota });

  const scans = useQuery({
    queryKey: ['scans'],
    queryFn: () => api.listScans(20),
    // Poll only while something can still change; a settled list is static
    // and polling it is pure noise against the rate limit.
    refetchInterval: (query) =>
      query.state.data?.scans.some((s) => isPending(s.status)) ? 3000 : false,
  });

  const createScan = useMutation({
    mutationFn: (input: string) => api.createScan(input),
    onSuccess: async ({ scan }) => {
      setUrl('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['scans'] }),
        queryClient.invalidateQueries({ queryKey: ['quota'] }),
      ]);
      router.push(`/scans/${scan.id}`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not start that scan.');
    },
  });

  const outOfScans = quota.data?.remaining === 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Scan a website</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Enter a domain. We open it in a real browser and capture what it is made of.
      </p>

      <form
        className="mt-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) createScan.mutate(url.trim());
        }}
      >
        <div className="relative flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="nike.com"
            className="pl-9"
            autoComplete="url"
            spellCheck={false}
            aria-label="Website to scan"
          />
        </div>
        <Button type="submit" disabled={createScan.isPending || !url.trim() || outOfScans}>
          {createScan.isPending ? 'Queueing…' : 'Scan'}
        </Button>
      </form>

      {quota.data ? (
        <p className="text-muted-foreground mt-3 text-xs">
          {quota.data.limit === null
            ? `Unlimited scans on the ${quota.data.plan} plan.`
            : `${quota.data.remaining} of ${quota.data.limit} scans left today.`}
          {outOfScans ? ' Upgrade for unlimited scans.' : null}
        </p>
      ) : null}

      <Card className="mt-10">
        <CardHeader>
          <CardTitle className="text-base">Recent scans</CardTitle>
        </CardHeader>
        <CardContent>
          {scans.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : scans.data && scans.data.scans.length > 0 ? (
            <ul className="divide-border/60 divide-y">
              {scans.data.scans.map((scan) => (
                <li key={scan.id}>
                  <Link
                    href={`/scans/${scan.id}`}
                    className="hover:bg-muted/40 -mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{scan.host}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {relative(scan.queuedAt)}
                        {scan.httpStatus ? ` · HTTP ${scan.httpStatus}` : ''}
                        {scan.loadTimeMs ? ` · ${scan.loadTimeMs} ms` : ''}
                        {scan.errorCode ? ` · ${scan.errorCode}` : ''}
                      </p>
                    </div>
                    <ScanStatusBadge status={scan.status} />
                    <ArrowRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No scans yet. Enter a domain above to run your first one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
