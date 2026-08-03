import Link from 'next/link';

import { Spotlight } from '@/components/ui/spotlight-new';

/** Shared frame for the auth pages: one spotlight canvas, one card. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-svh w-full items-center justify-center overflow-hidden px-4 py-12">
      <Spotlight />

      <div className="relative z-10 w-full max-w-sm">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground mb-8 block text-center text-sm transition-colors"
        >
          Internet Intelligence
        </Link>

        <div className="border-border/60 bg-card/60 rounded-xl border p-6 backdrop-blur-xl">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>

        {footer ? <div className="mt-6 text-center text-sm">{footer}</div> : null}
      </div>
    </main>
  );
}
