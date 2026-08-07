/**
 * Pulling the document apart, once per scan.
 *
 * Several signal kinds are views onto the same HTML: the inline scripts, the
 * meta tags, the body's class list, where the forms post to. Parsing the
 * document once and handing the pieces to every rule is both faster than 200
 * rules each running their own regex over the whole page and more accurate —
 * a rule matching `data-controller` against raw HTML would also fire on the
 * string appearing inside a comment or a JSON blob.
 */

import * as cheerio from 'cheerio';

export interface DerivedDocument {
  /** `src` of every external <script>. */
  scriptSrcs: string[];
  /** Contents of every inline <script>, joined. */
  inlineScript: string;
  /** Contents of every <style> block plus every style="" attribute, joined. */
  inlineStyle: string;
  /** Every meta tag as `name=content`, one per line. */
  meta: string;
  /** Content of every `<meta name="generator">`, joined. */
  generator: string;
  /** The <body> class attribute. */
  bodyClass: string;
  /** `action` of every <form>. */
  formActions: string[];
  /** `src` of every <iframe>. */
  iframeSrcs: string[];
  /** href of `<link rel="manifest">`, if the page declares one. */
  manifestHref: string | null;
}

const EMPTY: DerivedDocument = {
  scriptSrcs: [],
  inlineScript: '',
  inlineStyle: '',
  meta: '',
  generator: '',
  bodyClass: '',
  formActions: [],
  iframeSrcs: [],
  manifestHref: null,
};

/**
 * Parse a document. Never throws: a malformed page is still a page worth
 * reporting on, and Cheerio is tolerant, but a truncated capture or a
 * multi-megabyte inline blob has surprised parsers before.
 */
export function derive(html: string): DerivedDocument {
  if (!html) return EMPTY;

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return EMPTY;
  }

  const scriptSrcs: string[] = [];
  const inlineScripts: string[] = [];
  $('script').each((_, el) => {
    const src = $(el).attr('src');
    if (src) scriptSrcs.push(src);
    else {
      const body = $(el).text();
      if (body.trim()) inlineScripts.push(body);
    }
  });

  const styles: string[] = [];
  $('style').each((_, el) => {
    styles.push($(el).text());
  });
  $('[style]').each((_, el) => {
    const value = $(el).attr('style');
    if (value) styles.push(value);
  });

  const metaLines: string[] = [];
  const generators: string[] = [];
  $('meta').each((_, el) => {
    const $el = $(el);
    // name, property (OpenGraph) and http-equiv all identify a meta tag; a rule
    // should be able to key on any of them.
    const key = $el.attr('name') ?? $el.attr('property') ?? $el.attr('http-equiv') ?? '';
    const content = $el.attr('content') ?? '';
    if (!key && !content) return;
    metaLines.push(`${key}=${content}`);
    if (key.toLowerCase() === 'generator' && content) generators.push(content);
  });

  const formActions: string[] = [];
  $('form[action]').each((_, el) => {
    const action = $(el).attr('action');
    if (action) formActions.push(action);
  });

  const iframeSrcs: string[] = [];
  $('iframe[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src) iframeSrcs.push(src);
  });

  return {
    scriptSrcs,
    inlineScript: inlineScripts.join('\n'),
    inlineStyle: styles.join('\n'),
    meta: metaLines.join('\n'),
    generator: generators.join(' | '),
    bodyClass: $('body').attr('class') ?? '',
    formActions,
    iframeSrcs,
    manifestHref: $('link[rel="manifest" i]').attr('href') ?? null,
  };
}
