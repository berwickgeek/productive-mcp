/**
 * @fileoverview Shared rendering for attachment metadata on comments and tasks.
 * @module utils/attachments
 */

import { ProductiveIncludedResource } from '../api/types.js';

interface AttachmentRef {
  id: string;
  type: string;
}

interface AttachmentRelationships {
  attachments?: {
    data?: AttachmentRef[] | null;
  };
}

/**
 * Render a human-readable list of attachments for a comment or task.
 *
 * Resolves each attachment reference against the JSON:API `included` array to
 * show filename, content type and size. The download URL is deliberately NOT
 * rendered — it requires a secret token; callers should use the `get_attachment`
 * tool with the attachment ID to download bytes server-side.
 *
 * @param relationships - The resource's relationships object (may contain `attachments`)
 * @param included - The JSON:API `included` array from the response
 * @param indent - Leading whitespace applied to each line
 * @returns A formatted block (leading newline included), or an empty string when there are no attachments
 */
export function formatAttachments(
  relationships: AttachmentRelationships | undefined,
  included: ProductiveIncludedResource[] | undefined,
  indent = ''
): string {
  const refs = relationships?.attachments?.data;
  if (!refs || refs.length === 0) {
    return '';
  }

  const lines = refs.map((ref) => {
    const att = included?.find((item) => item.type === 'attachments' && item.id === ref.id);
    if (!att) {
      return `${indent}- ID ${ref.id}`;
    }
    const a = att.attributes;
    const size = typeof a.size === 'number' ? `${a.size} bytes` : 'unknown size';
    const name = a.name ?? 'unnamed';
    const contentType = a.content_type ?? 'unknown type';
    return `${indent}- ID ${ref.id}: ${name} (${contentType}, ${size})`;
  });

  return `\n${indent}Attachments (${refs.length}) — use get_attachment with the ID to download:\n${lines.join('\n')}`;
}
