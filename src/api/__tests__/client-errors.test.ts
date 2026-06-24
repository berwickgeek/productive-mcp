/**
 * @fileoverview Tests that Productive API errors surface JSON:API diagnostics
 *               (title, status, source.pointer) instead of being discarded.
 * @module api/__tests__/client-errors.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ProductiveAPIClient, ProductiveApiError } from '../client.js';
import { Config } from '../../config/index.js';

const config = {
  PRODUCTIVE_API_TOKEN: 'secret-token',
  PRODUCTIVE_ORG_ID: '1',
  PRODUCTIVE_API_BASE_URL: 'https://api.test/',
  PRODUCTIVE_ATTACHMENT_DIR: '/cache',
} as Config;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProductiveAPIClient error surfacing', () => {
  it('surfaces title, status and source.pointer from a 422 (makeRequest path)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          errors: [
            {
              status: '422',
              title: 'Invalid attribute',
              detail: 'attribute is invalid',
              source: { pointer: '/data/attributes/date' },
            },
          ],
        }),
      })
    );

    const client = new ProductiveAPIClient(config);

    let caught: unknown;
    try {
      await client.getTask('123');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ProductiveApiError);
    const err = caught as ProductiveApiError;
    expect(err.httpStatus).toBe(422);
    expect(err.message).toContain('Invalid attribute');
    expect(err.message).toContain('attribute is invalid');
    expect(err.message).toContain('[at /data/attributes/date]');
    expect(err.errors[0]?.source?.pointer).toBe('/data/attributes/date');
  });

  it('joins multiple errors into one message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          errors: [
            { status: '422', title: 'Invalid attribute', detail: 'is invalid', source: { pointer: '/data/attributes/date' } },
            { status: '422', title: 'Invalid relationship', detail: 'must exist', source: { pointer: '/data/relationships/task' } },
          ],
        }),
      })
    );

    const client = new ProductiveAPIClient(config);
    const err = (await client.getTask('123').catch((e) => e)) as ProductiveApiError;

    expect(err.message).toContain('/data/attributes/date');
    expect(err.message).toContain('/data/relationships/task');
    expect(err.message).toContain(';');
  });

  it('falls back to the status when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      })
    );

    const client = new ProductiveAPIClient(config);
    const err = (await client.getTask('123').catch((e) => e)) as ProductiveApiError;

    expect(err).toBeInstanceOf(ProductiveApiError);
    expect(err.httpStatus).toBe(500);
    expect(err.message).toBe('API request failed with status 500');
  });

  it('also surfaces diagnostics from void requests (makeVoidRequest path)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          errors: [{ status: '422', title: 'Invalid', detail: 'nope', source: { pointer: '/data/attributes/board_id' } }],
        }),
      })
    );

    const client = new ProductiveAPIClient(config);
    const err = (await client.archiveTaskList('5').catch((e) => e)) as ProductiveApiError;

    expect(err).toBeInstanceOf(ProductiveApiError);
    expect(err.httpStatus).toBe(422);
    expect(err.message).toContain('[at /data/attributes/board_id]');
  });
});
