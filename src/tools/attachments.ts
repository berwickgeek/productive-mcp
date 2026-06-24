/**
 * @fileoverview Tool for downloading Productive attachments so Claude can process them.
 * @module tools/attachments
 */

import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { ProductiveAPIClient } from '../api/client.js';
import { getConfig } from '../config/index.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

type ToolResult = { content: ToolContent[] };

const getAttachmentSchema = z.object({
  attachment_id: z.string().min(1, 'Attachment ID is required'),
});

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

    const file = await client.downloadAttachment(params.attachment_id);

    const config = getConfig();
    const dir = config.PRODUCTIVE_ATTACHMENT_DIR;
    await fs.mkdir(dir, { recursive: true });

    const safeName = sanitizeFilename(file.name || `attachment-${params.attachment_id}`);
    const filePath = path.join(dir, `${params.attachment_id}-${safeName}`);
    await fs.writeFile(filePath, file.data);

    const content: ToolContent[] = [
      {
        type: 'text',
        text:
          `Attachment downloaded.\n` +
          `Name: ${file.name}\n` +
          `Type: ${file.contentType}\n` +
          `Size: ${file.size} bytes\n` +
          `Saved to: ${filePath}`,
      },
    ];

    if (file.contentType?.startsWith('image/')) {
      content.push({
        type: 'image',
        data: file.data.toString('base64'),
        mimeType: file.contentType,
      });
    }

    return { content };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map((e) => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const getAttachmentDefinition = {
  name: 'get_attachment',
  description:
    'Download an attachment from Productive.io by its ID so it can be processed (PDF, Excel, image, or any file type). ' +
    'The file is saved to a local cache directory and the path is returned; images are also returned inline. ' +
    'Find attachment IDs via get_task, get_comment, or list_comments (attachments are listed with their IDs).',
  inputSchema: {
    type: 'object',
    properties: {
      attachment_id: {
        type: 'string',
        description: 'The ID of the attachment to download (required)',
      },
    },
    required: ['attachment_id'],
  },
};
