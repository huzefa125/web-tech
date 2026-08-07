import { Fingerprint, Gauge, History, Lock, Radar, Server, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

const FEATURES = [
  {
    title: 'Technology detection',
    description:
      'Frameworks, CMSes, UI kits, animation libraries and backends — read from page globals, cookies, response headers, bundle paths and DNS.',
    icon: Fingerprint,
  },
  {
    title: 'Hosting and CDN',
    description:
      'Where a site is served from and which edge it sits behind — even when the origin strips its own headers.',
    icon: Server,
  },
  {
    title: 'Performance',
    description: 'Measured on a real browser, not estimated from a synthetic model.',
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
      'Every scan is appended, never overwritten — so the record can say exactly when a stack changed, and to what.',
    icon: History,
  },
];

/** What the detector actually reads. Concrete beats adjectives. */
const SIGNALS = [
  ['window.__NEXT_DATA__', 'Next.js'],
  ['PHPSESSID', 'PHP'],
  ['cf-ray', 'Cloudflare'],
  ['/_astro/', 'Astro'],
  ['cname.vercel-dns.com', 'Vercel'],
  ['--tw-ring-offset-shadow', 'Tailwind CSS'],
];

export default function LandingPage() {
  return (
    <main className="relative flex min-h-svh flex-col">
      <div className="surface-grid pointer-events-none absolute inset-x-0 top-0 h-[32rem]" aria-hidden />

      <header className="relative mx-auto flex h-16 w-full max-w-6xl items-center px-4">
        <span className="flex items-center gap-2 font-semibold">
          <Radar className="text-primary size-5" aria-hidden />
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

      <section className="relative mx-auto w-full max-w-3xl px-4 pt-20 pb-16 text-center sm:pt-28">
        <p className="text-muted-foreground mb-6 text-xs tracking-[0.18em] uppercase">
          Website intelligence, with a memory
        </p>

        <h1 className="text-4xl font-semibold sm:text-6xl">Know what any website is built on</h1>

        <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-base leading-relaxed text-pretty">
          Enter a domain. We open it in a real browser, capture what it serves, and tell you the
          stack behind it — with the evidence for every call.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/signup">
              Scan your first site
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">I already have an account</Link>
          </Button>
        </div>

        <p className="text-muted-foreground mt-4 text-xs">
          Free plan includes 5 scans a day. No card required.
        </p>
      </section>

      {/* The product's whole claim is that it shows its working, so the landing
          page shows the working too rather than asserting accuracy. */}
      <section className="relative mx-auto w-full max-w-3xl px-4 pb-20">
        <p className="text-muted-foreground mb-4 text-center text-xs tracking-[0.14em] uppercase">
          213 rules · 19 kinds of evidence
        </p>
        <ul className="flex flex-wrap justify-center gap-2">
          {SIGNALS.map(([signal, tech]) => (
            <li
              key={signal}
              className="border-border bg-card flex items-center gap-2 rounded-full border py-1.5 pr-3 pl-3 text-xs shadow-xs"
            >
              <code className="text-muted-foreground font-mono">{signal}</code>
              <ArrowRight className="text-muted-foreground/60 size-3" aria-hidden />
              <span className="font-medium">{tech}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-4 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="border-border bg-card rounded-xl border p-5 shadow-xs transition-shadow hover:shadow-sm"
            >
              <feature.icon className="text-primary size-5" aria-hidden />
              <h2 className="mt-4 text-sm font-semibold">{feature.title}</h2>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-border relative mt-auto border-t">
        <div className="text-muted-foreground mx-auto w-full max-w-6xl px-4 py-6 text-xs">
          Internet Intelligence Platform
        </div>
      </footer>
    </main>
  );
}
