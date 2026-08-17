/**
 * @fileoverview The two arguments handed to the MCP `Server` constructor.
 *
 * Kept out of server.ts so they can be asserted on directly. `createServer` connects a stdio
 * transport before it returns, so a test cannot call it to inspect what was built.
 *
 * The instructions reach the model as the `instructions` field on InitializeResult, which is
 * where cross-tool routing rules belong. Tool descriptions alone cannot express "call A
 * before B", because a model reading a list of tools weighs each description on its own and
 * the literal name match usually wins.
 *
 * Note the shape carefully. `instructions` belongs on the SECOND constructor argument
 * (ServerOptions). A `description` key on the first argument (Implementation) is not an MCP
 * field, is never read by the SDK, and is silently dropped. That was the original bug.
 *
 * @module server-instructions
 */

import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';

/** Identity advertised at initialize. Deliberately carries no guidance: the SDK would drop it. */
export const SERVER_INFO: Implementation = {
  name: 'productive-mcp',
  version: '1.0.0',
};

/**
 * Build the instructions string for this server.
 *
 * Keep it short. It is spent on every session that connects.
 *
 * @param userId - The configured PRODUCTIVE_USER_ID, if any. Enables the "me" shorthand.
 * @returns The instructions to advertise at initialize.
 */
export function buildInstructions(userId?: string): string {
  // "me" is resolved per-tool, not centrally, so listing the tools that honour it is the
  // difference between a working shorthand and a filter that silently does nothing.
  const userContext = userId
    ? [
        `You are acting as the user with ID ${userId}. Call whoami to confirm.`,
        'Pass the literal string "me" only to create_task and update_task_assignment',
        '(as assignee_id), and to create_time_entry and list_time_entries (as person_id).',
        'Those tools resolve it. Others do NOT: list_tasks forwards assignee_id straight',
        'to the API, so "me" there is not a filter for you. To list your own tasks use',
        'my_tasks.',
      ].join('\n')
    : 'No user is configured, so the "me" shorthand is unavailable. Set PRODUCTIVE_USER_ID to enable it.';

  return [
    'Productive.io. The hierarchy is Customers > Projects > Boards > Task Lists > Tasks.',
    '',
    'READING A TASK',
    'Given a task or issue ID, call get_task_overview FIRST. It returns metadata, the full',
    'description and the full recent comment bodies with an attachment index in one call.',
    'Do NOT call get_task, list_comments or get_comment first and then get_task_overview:',
    'the overview already contains all of it, so the earlier call is a wasted round trip.',
    'If you need comments older than the ones returned, raise the overview\'s comment_limit',
    '(up to 50) rather than reaching for list_comments.',
    'Use get_task only for a task attribute the overview omits (updated_at, priority) or to',
    're-check one field on a task whose thread you have already read.',
    '',
    'USER CONTEXT',
    userContext,
  ].join('\n');
}

/**
 * Build the ServerOptions, including the instructions the client will surface.
 *
 * @param userId - The configured PRODUCTIVE_USER_ID, if any.
 */
export function buildServerOptions(userId?: string): ServerOptions {
  return {
    capabilities: {
      tools: {},
      prompts: {},
    },
    instructions: buildInstructions(userId),
  };
}
