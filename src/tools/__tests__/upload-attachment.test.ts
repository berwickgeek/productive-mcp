/**
 * @fileoverview Tests for the upload_attachment tool: argument rules, pre-flight file checks,
 * the per-file create/upload/temp_url sequence, and rollback when any step fails.
 * @module tools/__tests__/upload-attachment.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// A fake disk: path -> bytes. stat and readFile read from it; anything absent is ENOENT.
const disk = new Map<string, Buffer>();
const readFile = vi.fn(async (p: string) => {
  const data = disk.get(p);
  if (!data) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  return data;
});
const stat = vi.fn(async (p: string) => {
  if (p.endsWith('dir')) return { isFile: () => false, size: 0 };
  const data = disk.get(p);
  if (!data) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  return { isFile: () => true, size: Number((data as Buffer & { fakeSize?: number }).fakeSize ?? data.length) };
});
vi.mock('fs', () => ({
  promises: {
    stat: (p: string) => stat(p),
    readFile: (p: string) => readFile(p),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock('../../config/index.js', () => ({
  getConfig: () => ({
    PRODUCTIVE_API_TOKEN: 'secret-token',
    PRODUCTIVE_ORG_ID: '1',
    PRODUCTIVE_API_BASE_URL: 'https://api.test/',
    PRODUCTIVE_ATTACHMENT_DIR: '/cache',
  }),
}));

import {
  uploadAttachmentTool,
  contentTypeFor,
  policySizeLimit,
  MAX_ATTACHMENT_BYTES,
} from '../attachments.js';
import { ProductiveAPIClient } from '../../api/client.js';

// Absolute on both platforms: path.isAbsolute accepts a leading slash on Windows too.
const SHOT_A = '/tmp/uploads/error-one.png';
const SHOT_B = '/tmp/uploads/error-two.jpg';

function encodePolicy(maxBytes: number): string {
  return Buffer.from(
    JSON.stringify({ conditions: [{ bucket: 'b' }, ['content-length-range', 0, maxBytes]] })
  ).toString('base64');
}

function mockClient(opts: { failUploadOn?: string; policyMax?: number; failDeleteOn?: string } = {}) {
  let next = 1000001;
  const records = new Map<string, { name: string; size: number }>();

  const createAttachment = vi.fn(async (file: { name: string; size: number }) => {
    const id = String(next++);
    records.set(id, { name: file.name, size: file.size });
    return {
      data: {
        id,
        type: 'attachments',
        attributes: {
          name: file.name,
          size: file.size,
          url: `https://files.example.com/attachments/${id}/${file.name}`,
          aws_policy: { key: `attachments/${id}`, policy: encodePolicy(opts.policyMax ?? MAX_ATTACHMENT_BYTES) },
        },
      },
    };
  });
  const uploadAttachmentFile = vi.fn(async (_policy: unknown, file: { name: string }) => {
    if (file.name === opts.failUploadOn) throw new Error(`Upload of ${file.name} to storage failed: 403 (AccessDenied)`);
    return `https://storage.example.com/${file.name}`;
  });
  const setAttachmentTempUrl = vi.fn(async (id: string) => {
    const r = records.get(id)!;
    return {
      data: {
        id,
        type: 'attachments',
        attributes: { name: r.name, size: r.size, url: `https://files.example.com/attachments/${id}/${r.name}` },
      },
    };
  });
  const deleteAttachment = vi.fn(async (id: string) => {
    if (id === opts.failDeleteOn) throw new Error('boom');
  });

  const client = {
    createAttachment,
    uploadAttachmentFile,
    setAttachmentTempUrl,
    deleteAttachment,
  } as unknown as ProductiveAPIClient;
  return { client, createAttachment, uploadAttachmentFile, setAttachmentTempUrl, deleteAttachment };
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return (result.content[0] as { text: string }).text;
}

async function rejection(p: Promise<unknown>): Promise<McpError> {
  try {
    await p;
  } catch (e) {
    return e as McpError;
  }
  throw new Error('expected a rejection');
}

beforeEach(() => {
  disk.clear();
  disk.set(SHOT_A, Buffer.from('png-bytes-one'));
  disk.set(SHOT_B, Buffer.from('jpeg-bytes-two!'));
  readFile.mockClear();
  stat.mockClear();
});

describe('uploadAttachmentTool', () => {
  it('runs create, upload and temp_url for each file and returns id, name, size and url', async () => {
    const m = mockClient();

    const result = await uploadAttachmentTool(m.client, { file_paths: [SHOT_A, SHOT_B], task_id: '2000001' });

    expect(m.createAttachment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: 'error-one.png', contentType: 'image/png', size: 13 }),
      { type: 'task', id: '2000001' }
    );
    expect(m.createAttachment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: 'error-two.jpg', contentType: 'image/jpeg', size: 15 }),
      { type: 'task', id: '2000001' }
    );
    // The bytes sent are the bytes on disk, under the policy from the matching create.
    expect(m.uploadAttachmentFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ key: 'attachments/1000001' }),
      { name: 'error-one.png', contentType: 'image/png', data: disk.get(SHOT_A) }
    );
    expect(m.setAttachmentTempUrl).toHaveBeenNthCalledWith(1, '1000001', 'https://storage.example.com/error-one.png');
    expect(m.setAttachmentTempUrl).toHaveBeenNthCalledWith(2, '1000002', 'https://storage.example.com/error-two.jpg');
    expect(m.deleteAttachment).not.toHaveBeenCalled();

    const text = textOf(result);
    expect(text).toContain('Uploaded 2 attachment(s) to task 2000001');
    expect(text).toContain('ID 1000001: error-one.png (13 bytes)');
    expect(text).toContain('URL: https://files.example.com/attachments/1000002/error-two.jpg');
  });

  it('attaches to a comment when comment_id is given', async () => {
    const m = mockClient();

    await uploadAttachmentTool(m.client, { file_paths: [SHOT_A], comment_id: '3000001' });

    expect(m.createAttachment).toHaveBeenCalledWith(expect.anything(), { type: 'comment', id: '3000001' });
  });

  it('uses the name override for a single file', async () => {
    const m = mockClient();

    await uploadAttachmentTool(m.client, { file_paths: [SHOT_A], task_id: '2000001', name: 'login-error.png' });

    expect(m.createAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'login-error.png', contentType: 'image/png' }),
      expect.anything()
    );
  });

  it.each([
    ['neither parent', { file_paths: [SHOT_A] }],
    ['both parents', { file_paths: [SHOT_A], task_id: '1', comment_id: '2' }],
    ['a name with several files', { file_paths: [SHOT_A, SHOT_B], task_id: '1', name: 'x.png' }],
    ['no files', { file_paths: [], task_id: '1' }],
    ['more than 10 files', { file_paths: Array(11).fill(SHOT_A), task_id: '1' }],
  ])('rejects %s as InvalidParams without calling the API', async (_label, args) => {
    const m = mockClient();

    const err = await rejection(uploadAttachmentTool(m.client, args));

    expect(err.code).toBe(ErrorCode.InvalidParams);
    expect(m.createAttachment).not.toHaveBeenCalled();
  });

  it('fails on a missing file before creating anything, even when it is not the first', async () => {
    const m = mockClient();

    const err = await rejection(
      uploadAttachmentTool(m.client, { file_paths: [SHOT_A, '/tmp/uploads/missing.png'], task_id: '1' })
    );

    expect(err.code).toBe(ErrorCode.InvalidParams);
    expect(err.message).toContain('File not found: /tmp/uploads/missing.png');
    expect(m.createAttachment).not.toHaveBeenCalled();
  });

  it('rejects a relative path and a directory', async () => {
    const m = mockClient();

    const rel = await rejection(uploadAttachmentTool(m.client, { file_paths: ['shots/a.png'], task_id: '1' }));
    const dir = await rejection(uploadAttachmentTool(m.client, { file_paths: ['/tmp/uploads/dir'], task_id: '1' }));

    expect(rel.message).toContain('must be absolute');
    expect(dir.message).toContain('Not a file');
    expect(m.createAttachment).not.toHaveBeenCalled();
  });

  it('rejects a file over 100 MB before creating anything', async () => {
    const big = Object.assign(Buffer.from('x'), { fakeSize: MAX_ATTACHMENT_BYTES + 1 });
    disk.set('/tmp/uploads/huge.mp4', big);
    const m = mockClient();

    const err = await rejection(
      uploadAttachmentTool(m.client, { file_paths: [SHOT_A, '/tmp/uploads/huge.mp4'], task_id: '1' })
    );

    expect(err.code).toBe(ErrorCode.InvalidParams);
    expect(err.message).toContain('File too large');
    expect(m.createAttachment).not.toHaveBeenCalled();
  });

  it('deletes every record it created when a later upload fails', async () => {
    const m = mockClient({ failUploadOn: 'error-two.jpg' });

    const err = await rejection(uploadAttachmentTool(m.client, { file_paths: [SHOT_A, SHOT_B], task_id: '1' }));

    // The first file completed and the second was created before its upload failed: both go.
    expect(m.deleteAttachment).toHaveBeenCalledTimes(2);
    expect(m.deleteAttachment).toHaveBeenCalledWith('1000001');
    expect(m.deleteAttachment).toHaveBeenCalledWith('1000002');
    expect(err.code).toBe(ErrorCode.InternalError);
    expect(err.message).toContain('Upload of error-two.jpg to storage failed');
    expect(err.message).toContain('Rolled back: deleted the 2 attachment record(s)');
  });

  it('names records it could not delete during rollback', async () => {
    const m = mockClient({ failUploadOn: 'error-two.jpg', failDeleteOn: '1000001' });

    const err = await rejection(uploadAttachmentTool(m.client, { file_paths: [SHOT_A, SHOT_B], task_id: '1' }));

    expect(err.message).toContain('Rollback incomplete');
    expect(err.message).toContain('1000001');
  });

  it('rolls back when the signed policy allows less than the file size', async () => {
    const m = mockClient({ policyMax: 10 });

    const err = await rejection(uploadAttachmentTool(m.client, { file_paths: [SHOT_A], task_id: '1' }));

    expect(err.code).toBe(ErrorCode.InvalidParams);
    expect(err.message).toContain('accepts up to 10 bytes');
    expect(m.uploadAttachmentFile).not.toHaveBeenCalled();
    expect(m.deleteAttachment).toHaveBeenCalledWith('1000001');
  });
});

describe('contentTypeFor', () => {
  it('maps common extensions case-insensitively and falls back to octet-stream', () => {
    expect(contentTypeFor('/a/Shot.PNG')).toBe('image/png');
    expect(contentTypeFor('/a/photo.jpeg')).toBe('image/jpeg');
    expect(contentTypeFor('/a/report.pdf')).toBe('application/pdf');
    expect(contentTypeFor('/a/sheet.xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(contentTypeFor('/a/blob.unknownext')).toBe('application/octet-stream');
    expect(contentTypeFor('/a/noext')).toBe('application/octet-stream');
  });
});

describe('policySizeLimit', () => {
  it('reads the upper bound of content-length-range', () => {
    expect(policySizeLimit({ key: 'k', policy: encodePolicy(104857600) })).toBe(104857600);
  });

  it('returns undefined for an unreadable policy', () => {
    expect(policySizeLimit({ key: 'k', policy: 'not base64 json' })).toBeUndefined();
  });
});
