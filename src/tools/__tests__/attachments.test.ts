/**
 * @fileoverview Tests for the get_attachment tool and client download mechanism.
 * @module tools/__tests__/attachments.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the filesystem so tests never touch disk.
const mkdir = vi.fn().mockResolvedValue(undefined);
const writeFile = vi.fn().mockResolvedValue(undefined);
vi.mock('fs', () => ({
  promises: {
    mkdir: (...args: unknown[]) => mkdir(...args),
    writeFile: (...args: unknown[]) => writeFile(...args),
  },
}));

// Mock config so the cache dir is deterministic and no env validation runs.
vi.mock('../../config/index.js', () => ({
  getConfig: () => ({
    PRODUCTIVE_API_TOKEN: 'secret-token',
    PRODUCTIVE_ORG_ID: '1',
    PRODUCTIVE_API_BASE_URL: 'https://api.test/',
    PRODUCTIVE_ATTACHMENT_DIR: '/cache',
  }),
}));

import { getAttachmentTool } from '../attachments.js';
import { ProductiveAPIClient } from '../../api/client.js';
import { Config } from '../../config/index.js';

beforeEach(() => {
  mkdir.mockClear();
  writeFile.mockClear();
});

function mockClient(file: { name: string; contentType: string; size: number; data: Buffer }) {
  const downloadAttachment = vi.fn().mockResolvedValue(file);
  const client = { downloadAttachment } as unknown as ProductiveAPIClient;
  return { client, downloadAttachment };
}

describe('getAttachmentTool', () => {
  it('downloads, saves to the cache dir, and returns the path for a PDF', async () => {
    const { client, downloadAttachment } = mockClient({
      name: 'report.pdf',
      contentType: 'application/pdf',
      size: 1234,
      data: Buffer.from('%PDF-1.4 fake'),
    });

    const result = await getAttachmentTool(client, { attachment_id: '8779248' });

    expect(downloadAttachment).toHaveBeenCalledWith('8779248');
    expect(mkdir).toHaveBeenCalledWith('/cache', { recursive: true });
    expect(writeFile).toHaveBeenCalledTimes(1);
    const text = result.content[0] as { type: string; text: string };
    expect(text.text).toContain('report.pdf');
    expect(text.text).toContain('application/pdf');
    expect(text.text).toContain('1234 bytes');
    expect(text.text).toContain('8779248-report.pdf');
    // PDF is not an image -> no inline image block.
    expect(result.content).toHaveLength(1);
  });

  it('returns an inline image block for image content types', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const { client } = mockClient({
      name: 'image.png',
      contentType: 'image/png',
      size: bytes.length,
      data: bytes,
    });

    const result = await getAttachmentTool(client, { attachment_id: '8779231' });

    expect(result.content).toHaveLength(2);
    const image = result.content[1] as { type: string; data: string; mimeType: string };
    expect(image.type).toBe('image');
    expect(image.mimeType).toBe('image/png');
    expect(image.data).toBe(bytes.toString('base64'));
  });

  it('sanitizes unsafe characters in the filename', async () => {
    const { client } = mockClient({
      name: 'my report (final).xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 10,
      data: Buffer.from('PK'),
    });

    await getAttachmentTool(client, { attachment_id: '55' });

    const savedPath = writeFile.mock.calls[0][0] as string;
    expect(savedPath).not.toContain(' ');
    expect(savedPath).not.toContain('(');
    expect(savedPath).toContain('55-my_report__final_.xlsx');
  });

  it('rejects a missing attachment_id', async () => {
    const { client } = mockClient({ name: 'x', contentType: 'text/plain', size: 1, data: Buffer.from('x') });
    await expect(getAttachmentTool(client, {})).rejects.toThrow(/Invalid parameters/);
    await expect(getAttachmentTool(client, { attachment_id: '' })).rejects.toThrow(
      /Attachment ID is required/
    );
  });
});

describe('ProductiveAPIClient.downloadAttachment', () => {
  const config = {
    PRODUCTIVE_API_TOKEN: 'secret-token',
    PRODUCTIVE_ORG_ID: '1',
    PRODUCTIVE_API_BASE_URL: 'https://api.test/',
    PRODUCTIVE_ATTACHMENT_DIR: '/cache',
  } as Config;

  it('appends the token to the file url and returns decoded bytes', async () => {
    const meta = {
      data: {
        id: '8779248',
        type: 'attachments',
        attributes: {
          name: 'report.pdf',
          content_type: 'application/pdf',
          size: 5,
          url: 'https://files.productive.io/attachments/files/008/779/248/original/report.pdf?1781846698',
        },
      },
    };
    const fileBytes = new Uint8Array([1, 2, 3, 4, 5]);

    const fetchMock = vi
      .fn()
      // 1st call: getAttachment metadata
      .mockResolvedValueOnce({ ok: true, json: async () => meta })
      // 2nd call: file download
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => fileBytes.buffer });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ProductiveAPIClient(config);
    const file = await client.downloadAttachment('8779248');

    // Token appended with '&' because the url already has a query string.
    const downloadUrl = fetchMock.mock.calls[1][0] as string;
    expect(downloadUrl).toContain('?1781846698&token=secret-token');
    expect(file.name).toBe('report.pdf');
    expect(file.contentType).toBe('application/pdf');
    expect(Array.from(file.data)).toEqual([1, 2, 3, 4, 5]);

    vi.unstubAllGlobals();
  });

  it('throws without leaking the token when the download fails', async () => {
    const meta = {
      data: {
        id: '99',
        type: 'attachments',
        attributes: {
          name: 'x.pdf',
          content_type: 'application/pdf',
          size: 1,
          url: 'https://files.productive.io/attachments/files/x.pdf?1',
        },
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => meta })
      .mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ProductiveAPIClient(config);

    let message = '';
    try {
      await client.downloadAttachment('99');
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }

    expect(message).toMatch(/Failed to download attachment 99: 403 Forbidden/);
    expect(message).not.toContain('secret-token');

    vi.unstubAllGlobals();
  });
});
