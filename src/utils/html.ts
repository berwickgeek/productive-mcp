/**
 * @fileoverview Converts Productive's HTML rich-text bodies into readable plain text.
 * @module utils/html
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '...',
  mdash: '-',
  ndash: '-',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
};

/** Decode the HTML entities Productive actually emits, plus numeric escapes. */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Convert an HTML comment or task description into plain text while keeping the
 * structure that carries meaning: paragraph breaks, list bullets, and link URLs.
 *
 * Anchors become `text (url)` so a reviewer can still follow a link, and images
 * become an `[inline image]` marker so their presence is visible even though the
 * bytes live on an attachment record.
 *
 * @param html - Raw HTML from a Productive `body` or `description` attribute
 * @returns Readable plain text, or an empty string when there is no content
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';

  let text = html;

  // Drop content that never renders as prose.
  text = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Anchors keep their destination: "label (https://...)".
  text = text.replace(
    /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, label: string) => {
      const cleanLabel = decodeEntities(label.replace(/<[^>]+>/g, '')).trim();
      const cleanHref = decodeEntities(href).trim();
      if (!cleanLabel) return cleanHref;
      if (cleanLabel === cleanHref) return cleanHref;
      return `${cleanLabel} (${cleanHref})`;
    }
  );

  text = text.replace(/<img\b[^>]*>/gi, ' [inline image] ');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|tr|blockquote|pre)>/gi, '\n\n');
  // The opening <li> supplies the line break, so closing it must not add another
  // or every list ends up double spaced.
  text = text.replace(/<li\b[^>]*>/gi, '\n- ');
  text = text.replace(/<\/li>/gi, '');
  text = text.replace(/<\/(ul|ol|table)>/gi, '\n');
  text = text.replace(/<t[dh]\b[^>]*>/gi, ' | ');

  // Anything left is presentational.
  text = text.replace(/<[^>]+>/g, '');
  text = decodeEntities(text);

  // Tidy the whitespace the tag stripping leaves behind.
  text = text.replace(/\r\n/g, '\n');
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
