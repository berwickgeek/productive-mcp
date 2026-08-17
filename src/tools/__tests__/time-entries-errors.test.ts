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

  // This file used to check only for 422 inline, so a bad service_id or task_id came back as
  // InternalError and read as a server fault rather than a wrong argument.
  it('maps a 404 to InvalidParams now that it shares toMcpError', async () => {
    const apiError = new ProductiveApiError(
      'Record Not Found (404): The requested record was not found',
      404,
      [{ status: '404', title: 'Record Not Found' }]
    );

    let caught: any;
    try {
      await createTimeEntryTool(clientThatThrows(apiError), validArgs);
    } catch (err) {
      caught = err;
    }

    expect(caught.code).toBe(ErrorCode.InvalidParams);
    expect(caught.message).toContain('Record Not Found');
  });

  it('still refuses to create without confirmation', async () => {
    const createTimeEntry = vi.fn();
    const client = { createTimeEntry } as unknown as ProductiveAPIClient;

    const result = await createTimeEntryTool(client, { ...validArgs, confirm: false });

    expect(createTimeEntry).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('confirm');
  });

  it('keeps the "me" rejection as InvalidParams rather than re-wrapping it', async () => {
    let caught: any;
    try {
      await createTimeEntryTool(clientThatThrows(new Error('unused')), { ...validArgs, person_id: 'me' }, {});
    } catch (err) {
      caught = err;
    }

    expect(caught.code).toBe(ErrorCode.InvalidParams);
    expect(caught.message).toContain('PRODUCTIVE_USER_ID');
  });
});
