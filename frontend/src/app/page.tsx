import { Fingerprint, Gauge, History, Lock, Radar, Server } from 'lucide-react';
import Link from 'next/link';

import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import { Button } from '@/components/ui/button';
import { Spotlight } from '@/components/ui/spotlight-new';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';

const FEATURES = [
  {
    title: 'Technology detection',
    description:
      'Frameworks, CMSes, UI libraries and backends, read from HTML signatures, script URLs and response headers.',
    icon: Fingerprint,
  },
  {
    title: 'Hosting and CDN',
    description: 'Where a site is served from, which edge it sits behind, and how fast it answers.',
    icon: Server,
  },
  {
    title: 'Performance',
    description: 'Metrics captured on a real browser, not a synthetic estimate.',
    icon: Gauge,
  },
  {
    title: 'Security posture',
    description: 'TLS configuration, security headers, and the gaps between them.',
    icon: Lock,
  },
  {
    title: 'Historical timeline',
    description:
      'Every scan is appended, never overwritten. See exactly when a stack changed — and to what.',
    icon: History,
    wide: true,
  },
];

export default function LandingPage() {
  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden">
      <Spotlight />

      <header className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center px-4">
        <span className="flex items-center gap-2 font-semibold">
          <Radar className="size-5 text-emerald-400" aria-hidden />
          Internet Intelligence
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </header>

      <section className="relative z-10 mx-auto w-full max-w-4xl px-4 pt-20 pb-16 text-center sm:pt-28">
        <p className="text-muted-foreground mb-6 text-xs tracking-[0.2em] uppercase">
          Website intelligence, with a memory
        </p>

        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Know what any website is built on
        </h1>

        <TextGenerateEffect
          className="mt-6"
          words="Enter a domain and get its stack, hosting, performance, security and DNS — captured by a real browser, and tracked every time it changes."
        />

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/signup">Scan your first site</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">I already have an account</Link>
          </Button>
        </div>

        <p className="text-muted-foreground mt-4 text-xs">
          Free plan includes 5 scans a day. No card required.
        </p>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-24">
        <BentoGrid className="mx-auto max-w-5xl md:auto-rows-[16rem]">
          {FEATURES.map((feature) => (
            <BentoGridItem
              key={feature.title}
              title={feature.title}
              description={feature.description}
              icon={<feature.icon className="size-5 text-emerald-400" aria-hidden />}
              className={feature.wide ? 'md:col-span-2' : ''}
              header={
                <div className="from-muted/60 to-background border-border/60 flex min-h-24 w-full flex-1 rounded-xl border bg-gradient-to-br" />
              }
            />
          ))}
        </BentoGrid>
      </section>

      <footer className="border-border/60 relative z-10 mt-auto border-t">
        <div className="text-muted-foreground mx-auto w-full max-w-6xl px-4 py-6 text-xs">
          Internet Intelligence Platform
        </div>
      </footer>
    </main>
  );
}
