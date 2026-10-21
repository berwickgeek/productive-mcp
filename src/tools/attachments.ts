/**
 * @fileoverview Tools for downloading Productive attachments so Claude can process them, and
 * for uploading local files onto a task or comment.
 * @module tools/attachments
 */

import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveAPIClient } from '../api/client.js';
import { AttachmentParent, AttachmentUploadPolicy } from '../api/types.js';
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

/**
 * Largest file Productive accepts: the `content-length-range` in every signed upload policy
 * (104857600 bytes, confirmed against the live API). Checked before anything is created; the
 * policy's own limit is checked again per file in case Productive changes it.
 */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

const MAX_UPLOAD_FILES = 10;

/** Content types by lower-case extension. Anything else uploads as application/octet-stream. */
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.heic': 'image/heic',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.eml': 'message/rfc822',
  '.msg': 'application/vnd.ms-outlook',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * The upper bound of the policy's `content-length-range` condition, or undefined when the
 * policy cannot be read or carries no range.
 */
export function policySizeLimit(policy: AttachmentUploadPolicy): number | undefined {
  try {
    const decoded = JSON.parse(Buffer.from(policy.policy, 'base64').toString('utf8'));
    const range = (decoded.conditions ?? []).find(
      (c: unknown) => Array.isArray(c) && c[0] === 'content-length-range'
    );
    return typeof range?.[2] === 'number' ? range[2] : undefined;
  } catch {
    return undefined;
  }
}

const uploadAttachmentSchema = z
  .object({
    file_paths: z
      .array(z.string().min(1, 'File path is required'))
      .min(1, 'Provide at least one file path')
      .max(MAX_UPLOAD_FILES, `At most ${MAX_UPLOAD_FILES} files per call`),
    task_id: z.string().min(1).optional(),
    comment_id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.task_id) !== Boolean(v.comment_id), {
    message: 'Provide exactly one of task_id or comment_id',
  })
  .refine((v) => !v.name || v.file_paths.length === 1, {
    message: 'name can only be given when uploading a single file',
    path: ['name'],
  });

interface PreparedFile {
  filePath: string;
  name: string;
  contentType: string;
  size: number;
}

/**
 * Check every path before anything is created in Productive, so a typo in the third path
 * does not leave the first two uploaded.
 */
async function prepareFiles(filePaths: string[], nameOverride?: string): Promise<PreparedFile[]> {
  const prepared: PreparedFile[] = [];
  for (const filePath of filePaths) {
    if (!path.isAbsolute(filePath)) {
      throw new McpError(ErrorCode.InvalidParams, `File path must be absolute: ${filePath}`);
    }
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      throw new McpError(ErrorCode.InvalidParams, `File not found: ${filePath}`);
    }
    if (!stat.isFile()) {
      throw new McpError(ErrorCode.InvalidParams, `Not a file: ${filePath}`);
    }
    if (stat.size > MAX_ATTACHMENT_BYTES) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `File too large: ${filePath} is ${stat.size} bytes; Productive accepts up to ${MAX_ATTACHMENT_BYTES} bytes (100 MB)`
      );
    }
    prepared.push({
      filePath,
      name: nameOverride ?? path.basename(filePath),
      contentType: contentTypeFor(filePath),
      size: stat.size,
    });
  }
  return prepared;
}

/**
 * Upload local files as attachments on a task or comment.
 *
 * Per file: create the record linked to its parent, POST the bytes to S3 with the signed
 * policy from the create response, then record the stored location as `temp_url`. If any
 * step fails for any file, every record this call created is deleted, so a failure never
 * leaves an empty placeholder on the task.
 *
 * @param client - The Productive API client
 * @param args - Tool arguments validated against {@link uploadAttachmentSchema}
 */
export async function uploadAttachmentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<ToolResult> {
  try {
    const params = uploadAttachmentSchema.parse(args);
    const parent: AttachmentParent = params.task_id
      ? { type: 'task', id: params.task_id }
      : { type: 'comment', id: params.comment_id as string };

    const files = await prepareFiles(params.file_paths, params.name);

    const createdIds: string[] = [];
    const uploaded: Array<{ id: string; name: string; size: number; url: string }> = [];

    try {
      for (const file of files) {
        const created = await client.createAttachment(file, parent);
        const id = created.data.id;
        createdIds.push(id);

        const policy = created.data.attributes.aws_policy;
        if (!policy) {
          throw new Error(`Productive returned no upload policy for ${file.name}.`);
        }
        const limit = policySizeLimit(policy);
        if (limit !== undefined && file.size > limit) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `File too large: ${file.filePath} is ${file.size} bytes; Productive accepts up to ${limit} bytes`
          );
        }

        const data = await fs.readFile(file.filePath);
        const location = await client.uploadAttachmentFile(policy, {
          name: file.name,
          contentType: file.contentType,
          data,
        });
        const updated = await client.setAttachmentTempUrl(id, location);
        const attrs = updated.data.attributes;
        uploaded.push({ id, name: attrs.name, size: attrs.size, url: attrs.url });
      }
    } catch (error) {
      const leftBehind: string[] = [];
      for (const id of createdIds) {
        try {
          await client.deleteAttachment(id);
        } catch {
          leftBehind.push(id);
        }
      }
      const cleanup =
        createdIds.length === 0
          ? 'Nothing was created.'
          : leftBehind.length === 0
            ? `Rolled back: deleted the ${createdIds.length} attachment record(s) this call created.`
            : `Rollback incomplete: could not delete attachment record(s) ${leftBehind.join(', ')}; remove them by hand.`;
      const mapped = toMcpError(error);
      throw new McpError(mapped.code, `${mapped.message.replace(/^MCP error -?\d+: /, '')} ${cleanup}`);
    }

    const target = `${parent.type} ${parent.id}`;
    const lines = uploaded.map(
      (a) => `- ID ${a.id}: ${a.name} (${a.size} bytes)\n  URL: ${a.url}`
    );
    return {
      content: [
        {
          type: 'text',
          text: `Uploaded ${uploaded.length} attachment(s) to ${target}:\n${lines.join('\n')}`,
        },
      ],
    };
  } catch (error) {
    throw toMcpError(error);
  }
}

export const uploadAttachmentDefinition = {
  name: 'upload_attachment',
  description:
    'Upload one or more local files to Productive.io as attachments on a task or a comment ' +
    '(for example, screenshots copied from a support ticket). Pass absolute file_paths and exactly one of task_id or comment_id. ' +
    'Content type comes from the file extension, size from disk, and the attachment name from the file name. ' +
    'Files over 100 MB are rejected. If any file fails, every attachment created by the call is deleted again. ' +
    'Returns the ID, name, size and URL of each attachment; download one back with get_attachment.',
  inputSchema: {
    type: 'object',
    properties: {
      file_paths: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: MAX_UPLOAD_FILES,
        description: 'Absolute paths of the local files to upload, up to 10.',
      },
      task_id: {
        type: 'string',
        description: 'The task to attach the files to. Give this or comment_id, not both.',
      },
      comment_id: {
        type: 'string',
        description: 'The comment to attach the files to. Give this or task_id, not both.',
      },
      name: {
        type: 'string',
        description: 'Attachment name to use instead of the file name. Only allowed with a single file.',
      },
    },
    required: ['file_paths'],
    // Exactly one of task_id / comment_id is required; the Zod schema enforces it.
    anyOf: [{ required: ['task_id'] }, { required: ['comment_id'] }],
  },
};
