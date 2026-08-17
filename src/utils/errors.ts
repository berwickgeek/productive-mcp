/**
 * @fileoverview Maps thrown errors onto the right MCP error code.
 *
 * JSON-RPC gives us only two useful codes here: InvalidParams (-32602) means "you gave me a
 * bad argument, fixing it is on you" and InternalError (-32603) means "something failed at my
 * end, retrying or fixing your argument will not help". Collapsing everything into the latter
 * tells a caller nothing, which is what the tools did before.
 *
 * @module utils/errors
 */

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveApiError } from '../api/client.js';

/**
 * HTTP statuses that mean the caller's argument was wrong, rather than the server or the
 * credentials being at fault.
 *
 * - 400 malformed request
 * - 404 the ID given does not exist
 * - 422 the value was well-formed but rejected (a locked timesheet period, a task outside an
 *   open budget, a workflow status not on this task's workflow)
 *
 * Deliberately excluded: 401 and 403 are a token or permission problem, and 429 and 5xx are
 * transient or server-side. None of those are fixed by the caller passing different arguments,
 * so they stay InternalError.
 */
const CALLER_FAULT_STATUSES = new Set([400, 404, 422]);

/**
 * Convert any thrown value into an McpError with an accurate code.
 *
 * Preserves `ProductiveApiError.message`, which already carries the JSON:API title, status and
 * `source.pointer`, so the caller gets a self-diagnosing message alongside the right code.
 *
 * @param error - The caught value.
 * @returns The McpError to throw.
 */
export function toMcpError(error: unknown): McpError {
  // Already mapped upstream (e.g. a "me" shorthand rejection). Do not re-wrap.
  if (error instanceof McpError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    // Keep the field path when Zod gives one ("limit: Number must be <= 200"), because
    // otherwise a caller with several arguments cannot tell which one was rejected.
    const details = error.errors.map(e =>
      e.path.length > 0 ? `${e.path.join('.')}: ${e.message}` : e.message
    );
    return new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${details.join(', ')}`);
  }

  if (error instanceof ProductiveApiError && CALLER_FAULT_STATUSES.has(error.httpStatus)) {
    return new McpError(ErrorCode.InvalidParams, error.message);
  }

  return new McpError(
    ErrorCode.InternalError,
    error instanceof Error ? error.message : 'Unknown error occurred'
  );
}
