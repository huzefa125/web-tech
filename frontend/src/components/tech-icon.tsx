import { TECH_ICONS } from '@/lib/tech-icons';

/**
 * A technology's brand mark.
 *
 * Marks are inlined SVG paths from simple-icons, not remote images: an <img>
 * pointing at a CDN would leak every scanned site's stack to a third party on
 * render, and would show broken tiles offline.
 *
 * Not every technology has a mark — simple-icons drops logos whose owners
 * restrict use (AWS, Oracle's Java), and small libraries never had one. Those
 * get a lettered tile tinted from their own name, so the row still has a
 * consistent visual anchor instead of a gap.
 */

/** Deterministic hue from a name, so a technology keeps the same tile colour. */
function hueFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return hash;
}

export function TechIcon({ name, size = 28 }: { name: string; size?: number }) {
  const icon = TECH_ICONS[name];

  if (icon) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-md"
        style={{
          width: size,
          height: size,
          // A tint of the brand colour, so white-on-white marks stay visible
          // and the row reads as a set rather than as scattered logos.
          backgroundColor: `#${icon.hex}1f`,
        }}
      >
        <svg
          role="img"
          aria-label={name}
          viewBox="0 0 24 24"
          width={size * 0.6}
          height={size * 0.6}
          fill={`#${icon.hex}`}
        >
          <path d={icon.path} />
        </svg>
      </span>
    );
  }

  const hue = hueFor(name);
  return (
    <span
      className="grid shrink-0 place-items-center rounded-md font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        backgroundColor: `hsl(${hue} 45% 50% / 0.16)`,
        color: `hsl(${hue} 55% 62%)`,
      }}
      aria-label={name}
      role="img"
    >
      {name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase()}
    </span>
  );
}
