/**
 * @fileoverview Shortens a rich-text body for a list view.
 *
 * A list tool that prints every record's full body does not degrade gracefully: it works on a
 * small project and returns nothing at all on a large one, because the client rejects the
 * result before the model sees it. Measured against a real project, `list_tasks` at limit 200
 * returned 172,524 characters, 119,169 of them (69%) task descriptions, and the call failed.
 * `list_time_entries` for one person for one month returned 136,267 characters, 94% of them
 * note bodies.
 *
 * So list views get a one-line summary and detail views keep the full body. Anything that
 * needs the whole description calls get_task_overview or get_task for that one record.
 *
 * @module utils/summary
 */

import { htmlToText } from './html.js';

/**
 * How much of a body a list view shows before truncating.
 *
 * At 200 tasks, every 80 characters of snippet costs 16,000 characters of result. This is
 * enough to tell two similarly-titled tasks apart, which is all a list has to do.
 */
export const LIST_BODY_CHARS = 80;

/**
 * Flatten a rich-text body to a single truncated line.
 *
 * The body arrives as HTML, so it is converted to text first: truncating raw HTML can cut a
 * tag in half and leave markup on screen, and it wastes the budget on markup rather than words.
 *
 * @param body - Raw HTML from a `description` or `note` attribute
 * @param maxChars - Characters to keep before truncating
 * @returns A single line, suffixed with a marker when it was cut, or '' when there is no body
 */
export function summariseBody(body: string | null | undefined, maxChars: number = LIST_BODY_CHARS): string {
  const text = htmlToText(body).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}... [truncated, ${text.length} chars total]`;
}
