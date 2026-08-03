'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TechCategory, Technology } from '@/lib/types';

/**
 * Detected technologies, grouped by what kind of thing they are.
 *
 * Confidence is shown rather than hidden: the detector is honest that a
 * `__NEXT_DATA__` global is proof and a Tailwind-looking class name is a
 * guess, and a user comparing two sites needs to know which they are reading.
 */

const CATEGORY_LABELS: Record<TechCategory, string> = {
  framework: 'Frameworks',
  cms: 'CMS',
  ecommerce: 'Ecommerce',
  ui: 'UI & styling',
  animation: 'Animation & 3D',
  library: 'Libraries',
  language: 'Languages & runtimes',
  server: 'Web server',
  hosting: 'Hosting',
  cdn: 'CDN',
  analytics: 'Analytics & monitoring',
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
  'language',
  'server',
  'hosting',
  'cdn',
  'analytics',
  'fonts',
  'other',
];

function confidenceLabel(confidence: number): { text: string; className: string } {
  if (confidence >= 90) return { text: 'Confirmed', className: 'text-emerald-400' };
  if (confidence >= 70) return { text: 'Likely', className: 'text-sky-400' };
  return { text: 'Possible', className: 'text-amber-400' };
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
    <div className="space-y-4">
      {grouped.map(({ category, items }) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-sm">{CATEGORY_LABELS[category]}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-border/60 divide-y">
              {items.map((tech) => {
                const confidence = confidenceLabel(tech.confidence);
                return (
                  <li key={tech.name} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-medium">{tech.name}</span>
                      {tech.version ? (
                        <span className="text-muted-foreground font-mono text-xs">
                          {tech.version}
                        </span>
                      ) : null}
                      <span className={`ml-auto text-xs ${confidence.className}`}>
                        {confidence.text}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {tech.evidence.join(' · ')}
                    </p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
