/**
 * @fileoverview Server-level instructions sent to the client at initialize.
 *
 * These reach the model as the MCP `instructions` field on InitializeResult, which is
 * where cross-tool routing rules belong. Tool descriptions alone cannot express "call A
 * before B", because a model reading a list of tools weighs each description on its own
 * and the literal name match usually wins.
 *
 * Keep this short. It is spent on every session that connects to this server.
 *
 * @module server-instructions
 */

/**
 * Build the instructions string for this server.
 *
 * @param userId - The configured PRODUCTIVE_USER_ID, if any. Enables the "me" shorthand.
 * @returns The instructions to advertise at initialize.
 */
export function buildInstructions(userId?: string): string {
  const userContext = userId
    ? `When the user says "me" or "assign to me", pass the literal string "me" as assignee_id. It resolves to the configured user (ID ${userId}). Call whoami to confirm who that is.`
    : `No user is configured, so the "me" shorthand is unavailable. Set PRODUCTIVE_USER_ID to enable it.`;

  return [
    'Productive.io. The hierarchy is Customers > Projects > Boards > Task Lists > Tasks.',
    '',
    'READING A TASK',
    'Given a task or issue ID, call get_task_overview FIRST. It returns metadata, the full',
    'description and the full recent comment bodies with an attachment index in one call.',
    'Do NOT call get_task, list_comments or get_comment first and then get_task_overview:',
    'the overview already contains all of it, so the earlier call is a wasted round trip.',
    'Reach for get_task only to re-check a single metadata field on a task whose thread you',
    'have already read, and for get_comment only to fetch one comment the overview omitted',
    'because it fell outside comment_limit.',
    '',
    'USER CONTEXT',
    userContext,
  ].join('\n');
}
