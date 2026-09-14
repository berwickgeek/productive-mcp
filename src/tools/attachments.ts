/**
 * @fileoverview Tool for downloading Productive attachments so Claude can process them.
 * @module tools/attachments
 */

import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { ProductiveAPIClient } from '../api/client.js';
import { getConfig } from '../config/index.js';
import { toMcpError } from '../utils/errors.js';

type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

type ToolResult = { content: ToolContent[] };

const getAttachmentSchema = z.object({
  attachment_id: z.string().min(1, 'Attachment ID is required').optional(),
  attachment_ids: z.array(z.string().min(1, 'Attachment ID is required')).min(1).max(25).optional(),
}).refine(
  (v) => Boolean(v.attachment_id) !== Boolean(v.attachment_ids),
  { message: 'Provide either attachment_id or attachment_ids, not both' }
);

/**
 * Make a filename safe for the local filesystem by replacing any character that
 * is not alphanumeric, dot, underscore or hyphen.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Download a Productive attachment by ID, save it to the local cache directory,
 * and return its path. For images, the bytes are also returned inline as an MCP
 * `image` content block so hosts without filesystem access can view them.
 *
 * Attachments may live on a task or a comment; fetch the parent with `get_task` /
 * `get_comment` (or `list_comments`) to discover attachment IDs first.
 *
 * @param client - The Productive API client
 * @param args - Tool arguments validated against {@link getAttachmentSchema}
 * @returns A text block with the saved path and metadata, plus an inline image block for image types
 */
export async function getAttachmentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<ToolResult> {
  try {
    const params = getAttachmentSchema.parse(args);
    const ids = params.attachment_ids ?? [params.attachment_id as string];
    const single = ids.length === 1;

    const config = getConfig();
    const dir = config.PRODUCTIVE_ATTACHMENT_DIR;
    await fs.mkdir(dir, { recursive: true });

    const lines: string[] = [];
    const content: ToolContent[] = [];
    let failures = 0;

    for (const id of ids) {
      let file;
      try {
        file = await client.downloadAttachment(id);
      } catch (error) {
        // One bad ID in a batch must not discard the files that did download.
        if (single) throw error;
        failures += 1;
        lines.push(`${id}: FAILED, ${toMcpError(error).message}`);
        continue;
      }

      const safeName = sanitizeFilename(file.name || `attachment-${id}`);
      const filePath = path.join(dir, `${id}-${safeName}`);
      await fs.writeFile(filePath, file.data);

      lines.push(
        single
          ? `Attachment downloaded.\nName: ${file.name}\nType: ${file.contentType}\n` +
            `Size: ${file.size} bytes\nSaved to: ${filePath}`
          : `${id}: ${file.name} (${file.contentType}, ${file.size} bytes)\n   Saved to: ${filePath}`
      );

      // Only a single-attachment request returns the bytes inline. Inlining a batch of images
      // would put several base64 blobs in one result, which is what a batch is meant to avoid.
      if (single && file.contentType?.startsWith('image/')) {
        content.push({
          type: 'image',
          data: file.data.toString('base64'),
          mimeType: file.contentType,
        });
      }
    }

    const header = single
      ? ''
      : `Downloaded ${ids.length - failures} of ${ids.length} attachments.\n\n`;
    content.unshift({ type: 'text', text: header + lines.join('\n') });

    return { content };
  } catch (error) {
    throw toMcpError(error);
  }
}

export const getAttachmentDefinition = {
  name: 'get_attachment',
  description:
    'Download an attachment from Productive.io by its ID so it can be processed (PDF, Excel, image, or any file type). ' +
    'The file is saved to a local cache directory and the path is returned; images are also returned inline. ' +
    'Find attachment IDs via get_task_overview, get_task, get_comment, or list_comments (attachments are listed with their IDs). ' +
    'To fetch several, pass attachment_ids in ONE call rather than calling this tool once per attachment.',
  inputSchema: {
    type: 'object',
    properties: {
      attachment_id: {
        type: 'string',
        description: 'The ID of a single attachment to download. Images are returned inline as well as saved.',
      },
      attachment_ids: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 25,
        description: 'Download several attachments in one call. Use this instead of calling get_attachment once per ID. Files are saved and their paths returned; images are not inlined in batch mode.',
      },
    },
    // Exactly one of attachment_id / attachment_ids is required; the Zod schema enforces it.
    anyOf: [{ required: ['attachment_id'] }, { required: ['attachment_ids'] }],
  },
};
