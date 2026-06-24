/**
 * @fileoverview Tests that create_time_entry maps Productive 422s to InvalidParams
 *               with the self-diagnosing message, and leaves other errors as InternalError.
 * @module tools/__tests__/time-entries-errors.test
 */

import { describe, it, expect, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createTimeEntryTool } from '../time-entries.js';
import { ProductiveAPIClient, ProductiveApiError } from '../../api/client.js';

const validArgs = {
  date: '2026-06-20',
  time: '30m',
  person_id: '698785',
  service_id: '456',
  task_id: '789',
  note: 'Worked on the attachment download feature',
  confirm: true,
};

function clientThatThrows(error: Error): ProductiveAPIClient {
  return { createTimeEntry: vi.fn().mockRejectedValue(error) } as unknown as ProductiveAPIClient;
}

describe('createTimeEntryTool - error mapping', () => {
  it('maps a 422 to InvalidParams and keeps the source.pointer in the message', async () => {
    const apiError = new ProductiveApiError(
      'Invalid attribute (422): attribute is invalid [at /data/attributes/date]',
      422,
      [{ status: '422', title: 'Invalid attribute', detail: 'attribute is invalid', source: { pointer: '/data/attributes/date' } }]
    );
    const client = clientThatThrows(apiError);

    let caught: any;
    try {
      await createTimeEntryTool(client, validArgs);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.code).toBe(ErrorCode.InvalidParams);
    expect(caught.message).toContain('/data/attributes/date');
    expect(caught.message).toContain('attribute is invalid');
  });

  it('leaves a non-422 API error as InternalError', async () => {
    const apiError = new ProductiveApiError('API request failed with status 500', 500, []);
    const client = clientThatThrows(apiError);

    let caught: any;
    try {
      await createTimeEntryTool(client, validArgs);
    } catch (err) {
      caught = err;
    }

    expect(caught.code).toBe(ErrorCode.InternalError);
    expect(caught.message).toContain('500');
  });
});
