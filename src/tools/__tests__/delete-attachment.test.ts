/**
 * @fileoverview delete_attachment behaviour beyond the shared confirmation gate
 * (delete-confirm.test.ts): batches, and naming the parent in the preview.
 * @module tools/__tests__/delete-attachment.test
 */

import { describe, it, expect, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveAPIClient, ProductiveApiError } from '../../api/client.js';
import { deleteAttachmentTool } from '../attachments.js';

const notFound = () =>
  new ProductiveApiError('Record Not Found (404): no such record', 404, [{ status: '404', title: 'Record Not Found' }]);

function attachment(id: string, parent: { kind: 'task' | 'comment'; id: string; title?: string }) {
  return {
    data: {
      id,
      attributes: { name: `file-${id}.png`, content_type: 'image/png', size: 100, attachable_type: parent.kind },
      relationships: {
        task: { data: parent.kind === 'task' ? { type: 'tasks', id: parent.id } : null },
        comment: { data: parent.kind === 'comment' ? { type: 'comments', id: parent.id } : null },
      },
    },
    included: parent.title ? [{ type: `${parent.kind}s`, id: parent.id, attributes: { title: parent.title } }] : [],
  };
}

function mockClient(records: Record<string, unknown>, failDelete: string[] = []) {
  const getAttachment = vi.fn(async (id: string) => {
    if (!records[id]) throw notFound();
    return records[id];
  });
  const deleteAttachment = vi.fn(async (id: string) => {
    if (failDelete.includes(id)) throw notFound();
  });
  return {
    client: { getAttachment, deleteAttachment } as unknown as ProductiveAPIClient,
    getAttachment,
    deleteAttachment,
  };
}

const RECORDS = {
  '5000001': attachment('5000001', { kind: 'task', id: '1000001', title: 'Member cannot log in' }),
  '5000002': attachment('5000002', { kind: 'comment', id: '2000001' }),
};

describe('deleteAttachmentTool', () => {
  it('asks for the parent so the preview can name it', async () => {
    const m = mockClient(RECORDS);

    await deleteAttachmentTool(m.client, { attachment_id: '5000001' });

    expect(m.getAttachment).toHaveBeenCalledWith('5000001', 'task,comment');
  });

  it('previews every attachment in a batch and deletes none', async () => {
    const m = mockClient(RECORDS);

    const result = await deleteAttachmentTool(m.client, { attachment_ids: ['5000001', '5000002'] });
    const text = result.content[0].text;

    expect(text).toContain('file-5000001.png (image/png, 100 bytes), on task 1000001 (Member cannot log in)');
    expect(text).toContain('file-5000002.png (image/png, 100 bytes), on comment 2000001');
    expect(m.deleteAttachment).not.toHaveBeenCalled();
  });

  it('fails the whole preview on one bad ID in a batch', async () => {
    const m = mockClient(RECORDS);

    await expect(
      deleteAttachmentTool(m.client, { attachment_ids: ['5000001', '5999999'] })
    ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    expect(m.deleteAttachment).not.toHaveBeenCalled();
  });

  it('deletes each attachment in a confirmed batch and reports a failure without stopping', async () => {
    const m = mockClient(RECORDS, ['5000001']);

    const result = await deleteAttachmentTool(m.client, { attachment_ids: ['5000001', '5000002'], confirm: true });
    const text = result.content[0].text;

    expect(m.deleteAttachment).toHaveBeenCalledTimes(2);
    expect(text).toContain('Deleted 1 of 2 attachments');
    expect(text).toContain('5000001: FAILED');
    expect(text).toContain('5000002: deleted');
  });

  it.each([
    ['neither', {}],
    ['both', { attachment_id: '1', attachment_ids: ['2'] }],
    ['more than 25', { attachment_ids: Array.from({ length: 26 }, (_, i) => String(i + 1)) }],
  ])('rejects %s as InvalidParams', async (_label, args) => {
    const m = mockClient(RECORDS);

    await expect(deleteAttachmentTool(m.client, { ...args, confirm: true })).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
    });
    expect(m.deleteAttachment).not.toHaveBeenCalled();
  });
});
