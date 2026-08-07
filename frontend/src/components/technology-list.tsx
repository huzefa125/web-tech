'use client';

import { TechIcon } from '@/components/tech-icon';
import { Card, CardContent } from '@/components/ui/card';
import type { TechCategory, Technology } from '@/lib/types';

/**
 * Detected technologies, grouped by what kind of thing they are.
 *
 * Confidence is shown rather than hidden: the detector is honest that a
 * `__NEXT_DATA__` global is proof and a Tailwind-looking class name is a
 * guess, and a user comparing two sites needs to know which they are reading.
 * The evidence behind each call is on the row itself — a stack report nobody
 * can audit is a stack report nobody should trust.
 */

const CATEGORY_LABELS: Record<TechCategory, string> = {
  framework: 'Frameworks',
  cms: 'CMS',
  ecommerce: 'Ecommerce',
  ui: 'UI & styling',
  animation: 'Animation & 3D',
  library: 'Libraries',
  build: 'Build tools',
  language: 'Languages & runtimes',
  server: 'Web server',
  hosting: 'Hosting',
  cdn: 'CDN',
  database: 'Database & BaaS',
  auth: 'Authentication',
  payment: 'Payments',
  analytics: 'Analytics',
  monitoring: 'Monitoring',
  maps: 'Maps',
  ai: 'AI',
  fonts: 'Fonts & icons',
  other: 'Other',
};

/** Display order — the things a user looks for first come first. */
const CATEGORY_ORDER: TechCategory[] = [
  'framework',
  'cms',
  'ecommerce',
  'ui',
  'animation',
  'library',
  'build',
  'language',
  'server',
  'hosting',
  'cdn',
  'database',
  'auth',
  'payment',
  'analytics',
  'monitoring',
  'maps',
  'ai',
  'fonts',
  'other',
];

/**
 * Confidence uses its own semantic tokens, not the accent — these three mean
 * something, and a reader must not mistake them for brand colour. The tokens
 * are darkened for a light ground; the 400-weight Tailwind shades this
 * replaced were close to invisible on white.
 */
function confidenceLabel(confidence: number): { text: string; className: string } {
  if (confidence >= 90) return { text: 'Confirmed', className: 'text-confirmed' };
  if (confidence >= 70) return { text: 'Likely', className: 'text-likely' };
  return { text: 'Possible', className: 'text-possible' };
}

export function TechnologyList({ technologies }: { technologies: Technology[] }) {
  if (technologies.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-sm">
            No technologies detected. This usually means the crawl has not finished, or the page
            served almost no markup or scripts.
          </p>
        </CardContent>
      </Card>
    );
  }

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: technologies.filter((t) => t.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    // Columns rather than a grid: category blocks vary a lot in height, and a
    // grid would leave ragged gaps under the short ones.
    <div className="gap-x-8 sm:columns-2 [&>*]:break-inside-avoid">
      {grouped.map(({ category, items }) => (
        <section key={category} className="mb-7">
          <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            {CATEGORY_LABELS[category]}
          </h3>

          <ul className="space-y-0.5">
            {items.map((tech) => {
              const confidence = confidenceLabel(tech.confidence);
              return (
                <li key={tech.name}>
                  <div className="hover:bg-muted/40 group flex items-start gap-3 rounded-md px-2 py-2 transition-colors">
                    <TechIcon name={tech.name} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-medium">{tech.name}</span>
                        {tech.version ? (
                          <span className="text-muted-foreground font-mono text-xs tabular-nums">
                            {tech.version}
                          </span>
                        ) : null}
                        <span className={`ml-auto text-[11px] ${confidence.className}`}>
                          {confidence.text}
                        </span>
                      </div>

                      <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
                        {tech.evidence.join(' · ')}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
