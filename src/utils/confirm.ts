/**
 * @fileoverview The two-step confirmation gate used by every destructive tool.
 *
 * Annotations tell a client that a tool is destructive, but the SDK is explicit that they are
 * hints and not a security boundary, so a client is free to ignore them. This gate does not
 * depend on the client honouring anything: the first call performs no deletion at all, it
 * describes the target and stops. Nothing is removed until a second call arrives carrying
 * `confirm: true`.
 *
 * The description matters as much as the gate. Confirming a bare ID confirms nothing, so the
 * preview names what is about to be destroyed, which also means a wrong ID is caught by the
 * lookup before anything is deleted rather than after.
 *
 * @module utils/confirm
 */

import { z } from 'zod';

/** The `confirm` flag, identical across every gated tool. */
export const confirmField = z.boolean().optional().default(false);

/** The JSON Schema counterpart, for a tool's inputSchema. */
export const confirmProperty = {
  type: 'boolean',
  description:
    'Set to true to actually delete. Call without it first to see what would be deleted.',
  default: false,
} as const;

/** What a caller is about to destroy. */
export interface DeletionTarget {
  /** The tool to call again, e.g. `delete_task`. */
  tool: string;
  /** The noun for this record, e.g. `task`. */
  kind: string;
  /** The record's ID. */
  id: string;
  /** Identifying lines, e.g. `Title: Fix the thing`. Empty entries are dropped. */
  details: Array<string | undefined>;
}

/**
 * Build the preview returned by an unconfirmed destructive call.
 *
 * Deliberately does not claim the deletion is irreversible in Productive itself, which is not
 * verified here. It states the checkable fact instead: this server offers no way back.
 *
 * @param target - What would be deleted.
 * @returns The tool result to return in place of deleting.
 */
export function deletionPreview(target: DeletionTarget): {
  content: Array<{ type: string; text: string }>;
} {
  const details = target.details.filter((d): d is string => Boolean(d));

  const text = [
    `Nothing has been deleted yet. This is a preview.`,
    ``,
    `About to delete ${target.kind} ${target.id}:`,
    ...details.map(d => `  ${d}`),
    ``,
    `This server has no tool to restore a deleted ${target.kind}.`,
    ``,
    `To go ahead, call ${target.tool} again with the same arguments plus "confirm": true.`,
  ].join('\n');

  return { content: [{ type: 'text', text }] };
}

/**
 * Shorten a body for a one-line preview, collapsing whitespace and stripping HTML tags.
 *
 * Productive comment and page bodies are HTML, so the raw value is unreadable in a preview.
 *
 * @param body - The raw body, possibly HTML or null.
 * @param max - Maximum length before truncation.
 * @returns A single-line excerpt, or undefined if there was nothing to show.
 */
export function excerpt(body: string | null | undefined, max = 120): string | undefined {
  if (!body) return undefined;
  const flat = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!flat) return undefined;
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}
