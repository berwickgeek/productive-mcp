/**
 * @fileoverview Tests that toMcpError distinguishes a caller's bad argument from a server
 *               fault, rather than collapsing everything into InternalError.
 * @module utils/__tests__/errors.test
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { toMcpError } from '../errors.js';
import { ProductiveApiError } from '../../api/client.js';

/** Builds a ProductiveApiError the way the client would for a given status. */
function apiError(status: number, title = 'Error') {
  return new ProductiveApiError(`${title} (${status}): something`, status, [
    { status: String(status), title, detail: 'something' },
  ]);
}

describe('toMcpError', () => {
  it.each([
    [400, 'malformed request'],
    [404, 'the ID does not exist'],
    [422, 'the value was rejected'],
  ])('maps %i to InvalidParams (%s)', (status) => {
    expect(toMcpError(apiError(status)).code).toBe(ErrorCode.InvalidParams);
  });

  it.each([
    [401, 'bad token'],
    [403, 'no permission'],
    [429, 'rate limited'],
    [500, 'server fault'],
    [503, 'unavailable'],
  ])('leaves %i as InternalError (%s)', (status) => {
    expect(toMcpError(apiError(status)).code).toBe(ErrorCode.InternalError);
  });

  it('keeps the self-diagnosing message when it remaps the code', () => {
    const err = new ProductiveApiError(
      'Invalid attribute (422): attribute is invalid [at /data/attributes/date]',
      422,
      [{ status: '422', title: 'Invalid attribute', source: { pointer: '/data/attributes/date' } }]
    );

    const mapped = toMcpError(err);

    expect(mapped.code).toBe(ErrorCode.InvalidParams);
    expect(mapped.message).toContain('/data/attributes/date');
  });

  it('maps a Zod failure to InvalidParams and lists the messages', () => {
    const schema = z.object({ task_id: z.string().min(1, 'Task ID is required') });

    let caught: unknown;
    try {
      schema.parse({ task_id: '' });
    } catch (err) {
      caught = err;
    }

    const mapped = toMcpError(caught);

    expect(mapped.code).toBe(ErrorCode.InvalidParams);
    expect(mapped.message).toContain('Task ID is required');
  });

  it('passes an existing McpError through without re-wrapping it', () => {
    const original = new McpError(ErrorCode.InvalidParams, 'Either workflow_status_id or status_name must be provided');

    const mapped = toMcpError(original);

    expect(mapped).toBe(original);
    expect(mapped.code).toBe(ErrorCode.InvalidParams);
  });

  it('handles a plain Error and a non-Error throw', () => {
    expect(toMcpError(new Error('boom')).code).toBe(ErrorCode.InternalError);
    expect(toMcpError(new Error('boom')).message).toContain('boom');
    expect(toMcpError('a bare string').message).toContain('Unknown error occurred');
  });
});
