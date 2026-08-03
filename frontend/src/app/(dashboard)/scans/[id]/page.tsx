'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { ScanScreenshot } from '@/components/scan-screenshot';
import { ScanStatusBadge, isPending } from '@/components/scan-status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ScanDetailPage() {
  // useParams rather than the async `params` prop: this is a client component,
  // and Next 16 hands `params` to pages as a Promise.
  const id = useParams<{ id: string }>().id;

  const query = useQuery({
    queryKey: ['scan', id],
    queryFn: () => api.getScan(id),
    // Crawls take seconds to tens of seconds; poll until the row settles.
    refetchInterval: (q) => (q.state.data && isPending(q.state.data.scan.status) ? 2000 : false),
  });

  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <Alert variant="destructive">
          <AlertTitle>Scan not found</AlertTitle>
          <AlertDescription>
            It may have been removed, or it belongs to another account.
          </AlertDescription>
        </Alert>
        <Button asChild variant="secondary" className="mt-4">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const { scan, assets, screenshot } = query.data;
  const css = assets.filter((a) => a.kind === 'css');
  const js = assets.filter((a) => a.kind === 'js');
  const html = assets.find((a) => a.kind === 'html');

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Dashboard
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{scan.host}</h1>
        <ScanStatusBadge status={scan.status} />
        {scan.finalUrl ? (
          <a
            href={scan.finalUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
          >
            Visit
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </div>

      {isPending(scan.status) ? (
        <Alert className="mt-6">
          <AlertTitle>Scan in progress</AlertTitle>
          <AlertDescription>
            The crawler is opening the page in a real browser. This usually takes a few seconds.
          </AlertDescription>
        </Alert>
      ) : null}

      {scan.status === 'failed' ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>{scan.errorCode ?? 'Scan failed'}</AlertTitle>
          <AlertDescription>{scan.errorMessage ?? 'The crawl did not complete.'}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="HTTP status" value={scan.httpStatus?.toString() ?? '—'} />
        <Stat label="Load time" value={scan.loadTimeMs ? `${scan.loadTimeMs} ms` : '—'} />
        <Stat label="Assets captured" value={assets.length.toString()} />
      </div>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="headers">Headers</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {screenshot ? (
            <ScanScreenshot scanId={scan.id} alt={`Screenshot of ${scan.host}`} />
          ) : (
            <p className="text-muted-foreground text-sm">
              No screenshot yet. It is captured when the crawl finishes.
            </p>
          )}
        </TabsContent>

        <TabsContent value="assets" className="mt-4 space-y-4">
          <AssetList title="HTML" assets={html ? [html] : []} />
          <AssetList title={`Stylesheets (${css.length})`} assets={css} />
          <AssetList title={`Scripts (${js.length})`} assets={js} />
        </TabsContent>

        <TabsContent value="headers" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {scan.responseHeaders && Object.keys(scan.responseHeaders).length > 0 ? (
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(0,14rem)_1fr]">
                  {Object.entries(scan.responseHeaders).map(([key, value]) => (
                    <div key={key} className="contents">
                      <dt className="text-muted-foreground font-mono text-xs break-all">{key}</dt>
                      <dd className="font-mono text-xs break-all">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-muted-foreground text-sm">No headers recorded.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  function AssetList({ title, assets: list }: { title: string; assets: typeof assets }) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-muted-foreground text-sm">None captured.</p>
          ) : (
            <ul className="divide-border/60 divide-y">
              {list.map((asset) => (
                <li key={asset.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{asset.url}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {asset.byteSize > 0 ? formatBytes(asset.byteSize) : 'too large to store'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
