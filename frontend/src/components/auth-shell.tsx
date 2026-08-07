import { Radar } from 'lucide-react';
import Link from 'next/link';

/** Shared frame for the auth pages: one ruled backdrop, one card. */
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
    <main className="relative flex min-h-svh w-full items-center justify-center px-4 py-12">
      <div className="surface-grid pointer-events-none absolute inset-x-0 top-0 h-96" aria-hidden />

      <div className="relative w-full max-w-sm">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground mb-8 flex items-center justify-center gap-2 text-sm font-medium transition-colors"
        >
          <Radar className="text-primary size-4" aria-hidden />
          Internet Intelligence
        </Link>

        <div className="border-border bg-card rounded-xl border p-6 shadow-sm">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>

        {footer ? <div className="mt-6 text-center text-sm">{footer}</div> : null}
      </div>
    </main>
  );
}
