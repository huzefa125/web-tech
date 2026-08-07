/**
 * The detection engine.
 *
 * Runs every rule against one scan's captured artefacts and returns what it
 * concluded. Pure: no database, no network, no browser — which is what makes
 * the rule set testable against fixture HTML rather than against live sites
 * that change under the test.
 */

import { derive, type DerivedDocument } from './derive.js';
import { RULES, type Rule, type Signal } from './rules.js';
import type { Detection, DetectionInput } from './types.js';

export type { Detection, DetectionInput } from './types.js';

interface SignalHit {
  confidence: number;
  evidence: string;
  version?: string | undefined;
}

/**
 * Everything a signal can be tested against, assembled once per scan.
 *
 * Building this up front matters: the document is parsed a single time instead
 * of once per rule, and a rule keyed on inline scripts cannot accidentally
 * match the same text sitting in a comment or an attribute elsewhere on the
 * page.
 */
interface Context {
  input: DetectionInput;
  doc: DerivedDocument;
}

/** Test one signal. Returns the hit, or null. */
function testSignal(signal: Signal, ctx: Context): SignalHit | null {
  const { input, doc } = ctx;
  const haystacks: string[] = [];

  switch (signal.in) {
    case 'html':
      haystacks.push(input.html);
      break;
    case 'css':
      haystacks.push(input.css);
      break;
    case 'js':
      haystacks.push(input.js);
      break;
    case 'metaGenerator':
      haystacks.push(doc.generator);
      break;
    case 'meta':
      haystacks.push(doc.meta);
      break;
    case 'bodyClass':
      haystacks.push(doc.bodyClass);
      break;
    case 'inlineScript':
      haystacks.push(doc.inlineScript);
      break;
    case 'inlineStyle':
      haystacks.push(doc.inlineStyle);
      break;
    case 'scriptSrc':
      haystacks.push(...doc.scriptSrcs);
      break;
    case 'formAction':
      haystacks.push(...doc.formActions);
      break;
    case 'iframe':
      haystacks.push(...doc.iframeSrcs);
      break;
    case 'assetUrl':
      haystacks.push(...input.assetUrls);
      break;
    case 'request':
      haystacks.push(...input.requestUrls);
      break;
    case 'url':
      haystacks.push(input.finalUrl);
      break;
    case 'manifest':
      haystacks.push(input.manifest ?? '');
      break;
    case 'serviceWorker':
      haystacks.push(...(input.serviceWorkers ?? []));
      break;
    case 'robots':
      haystacks.push(input.robots ?? '');
      break;
    case 'dns':
      haystacks.push(...(input.dns ?? []));
      break;
    case 'global':
      // Globals are exact names, never substrings: matching `$` as a substring
      // of `jQuery` would fire half the library rules on every page.
      return input.globals.includes(String(signal.match))
        ? { confidence: signal.confidence, evidence: signal.evidence }
        : null;
    case 'cookie':
      // Cookie names are matched whole for the same reason. A regex is still
      // allowed, for families like `wordpress_*`.
      if (typeof signal.match === 'string') {
        return input.cookies.includes(signal.match)
          ? { confidence: signal.confidence, evidence: signal.evidence }
          : null;
      }
      haystacks.push(...input.cookies);
      break;
    case 'header': {
      const value = signal.header ? input.headers[signal.header] : undefined;
      if (value === undefined) return null;
      haystacks.push(value);
      break;
    }
  }

  for (const haystack of haystacks) {
    if (!haystack) continue;

    if (typeof signal.match === 'string') {
      if (haystack.includes(signal.match)) {
        return { confidence: signal.confidence, evidence: signal.evidence };
      }
      continue;
    }

    const m = signal.match.exec(haystack);
    if (m) {
      return {
        confidence: signal.confidence,
        evidence: signal.evidence,
        version: signal.versionFrom ? m[1] : undefined,
      };
    }
  }

  return null;
}

function runRule(rule: Rule, ctx: Context): Detection | null {
  const hits = rule.signals
    .map((s) => testSignal(s, ctx))
    .filter((h): h is SignalHit => h !== null);

  if (hits.length === 0) return null;

  hits.sort((a, b) => b.confidence - a.confidence);
  const best = hits[0]!;

  return {
    name: rule.name,
    category: rule.category,
    // The version may come from a weaker signal than the strongest one, so
    // take the first hit that actually captured one.
    version: hits.find((h) => h.version)?.version,
    confidence: best.confidence,
    // Deduped: two signals can describe the same finding in the same words,
    // and repeating a sentence in the UI reads as a bug.
    evidence: [...new Set(hits.map((h) => h.evidence))],
  };
}

/**
 * Detect everything this scan's evidence supports.
 *
 * Results are sorted by confidence so the UI's first row is the thing we are
 * surest about, and `implies` fills in what a match necessarily brings with it
 * — a page can be unmistakably Next.js without ever mentioning React.
 */
export function detect(input: DetectionInput): Detection[] {
  const ctx: Context = { input, doc: derive(input.html) };

  const found = new Map<string, Detection>();
  for (const rule of RULES) {
    const detection = runRule(rule, ctx);
    if (detection) found.set(detection.name, detection);
  }

  // A second pass, because an implied technology may itself imply others
  // (Next.js → React, and separately → Node.js). One extra pass covers the
  // depth the rule set actually has; a fixed point would be over-engineering.
  for (let pass = 0; pass < 2; pass++) {
    for (const rule of RULES) {
      if (!rule.implies || !found.has(rule.name)) continue;

      for (const impliedName of rule.implies) {
        const existing = found.get(impliedName);
        if (existing) {
          // Direct evidence beats inference; do not overwrite it, but do
          // record that something else pointed here too.
          if (!existing.evidence.some((e) => e.startsWith('Implied by'))) {
            existing.evidence.push(`Implied by ${rule.name}`);
          }
          continue;
        }

        const impliedRule = RULES.find((r) => r.name === impliedName);
        found.set(impliedName, {
          name: impliedName,
          category: impliedRule?.category ?? 'other',
          confidence: 70,
          evidence: [`Implied by ${rule.name}`],
        });
      }
    }
  }

  return [...found.values()].sort(
    (a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name),
  );
}
