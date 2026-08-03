'use client';

import { useEffect, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

/**
 * The screenshot endpoint is bearer-authenticated, so an <img src> pointing at
 * it would arrive without an Authorization header and 401. Fetch the bytes
 * through the API client instead and hand the tag an object URL.
 */
export function ScanScreenshot({ scanId, alt }: { scanId: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    api
      .getScreenshot(scanId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      // Object URLs pin the blob in memory until revoked.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [scanId]);

  if (failed) {
    return (
      <div className="border-border/60 text-muted-foreground flex aspect-[16/10] items-center justify-center rounded-lg border text-sm">
        Screenshot unavailable
      </div>
    );
  }

  if (!src) return <Skeleton className="aspect-[16/10] w-full rounded-lg" />;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob: URL, so
    // next/image's optimiser has nothing to work with.
    <img
      src={src}
      alt={alt}
      className="border-border/60 w-full rounded-lg border"
    />
  );
}
