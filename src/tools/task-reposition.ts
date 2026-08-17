/**
 * @fileoverview reposition_task: move a task within its task list.
 *
 * The previous implementation could not work. It called getTask without an `include`, so the
 * task_list relationship came back as `{"meta": {"included": false}}` and the task list ID was
 * always undefined. That made the "we know the list" branch dead code, and every call fell
 * through to fetching 100 arbitrary tasks from across the whole org (2934 of them at the time
 * of writing), sorting that page by placement, and positioning against whichever unrelated
 * task happened to come first. When it found nothing it sent empty attributes and reported
 * success anyway, and it returned API failures as plain text with no isError, so a failed
 * reposition read as a successful one.
 *
 * This version resolves the task's real list, asks the API for the extreme task in that list
 * directly (`sort=placement` with a page size of one), and refuses to claim success when it
 * cannot do what was asked.
 *
 * @module tools/task-reposition
 */

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { ProductiveAPIClient } from '../api/client.js';
import type { TaskReposition } from '../api/types.js';
import { toMcpError } from '../utils/errors.js';

/**
 * Accepts snake_case, matching every other tool, while still honouring the original
 * camelCase names so existing callers do not break.
 */
export const taskRepositionSchema = z
  .object({
    task_id: z.string().optional().describe('The ID of the task to reposition'),
    taskId: z.string().optional().describe('Deprecated alias for task_id'),
    move_before_id: z.string().optional().describe('Position the task before this task ID'),
    move_after_id: z.string().optional().describe('Position the task after this task ID'),
    move_to_top: z.boolean().optional().describe('Move the task to the top of its list'),
    moveToTop: z.boolean().optional().describe('Deprecated alias for move_to_top'),
    move_to_bottom: z.boolean().optional().describe('Move the task to the bottom of its list'),
    moveToBottom: z.boolean().optional().describe('Deprecated alias for move_to_bottom'),
  })
  .transform(v => ({
    task_id: v.task_id ?? v.taskId,
    move_before_id: v.move_before_id,
    move_after_id: v.move_after_id,
    move_to_top: v.move_to_top ?? v.moveToTop,
    move_to_bottom: v.move_to_bottom ?? v.moveToBottom,
  }))
  .refine(v => Boolean(v.task_id), { message: 'task_id is required' })
  .refine(
    v =>
      [v.move_before_id, v.move_after_id, v.move_to_top || undefined, v.move_to_bottom || undefined]
        .filter(Boolean).length === 1,
    { message: 'Provide exactly one of move_before_id, move_after_id, move_to_top or move_to_bottom' }
  );

type RepositionParams = z.infer<typeof taskRepositionSchema>;

/**
 * Find the task at one end of a list.
 *
 * Asks the API to sort by placement and returns a single row, so this is exact rather than
 * "lowest placement in an arbitrary page".
 *
 * @param client - API client.
 * @param taskListId - The list to look in.
 * @param end - Which end to find.
 * @param excludeTaskId - The task being moved, which cannot anchor against itself.
 * @returns The anchor task ID, or undefined if the list has no other task.
 */
async function findEdgeTask(
  client: ProductiveAPIClient,
  taskListId: string,
  end: 'top' | 'bottom',
  excludeTaskId: string
): Promise<string | undefined> {
  const response = await client.listTasks({
    task_list_id: taskListId,
    sort: end === 'top' ? 'placement' : '-placement',
    limit: 2, // Two, so the task being moved can be skipped without a second request.
  });

  return response.data.find(t => t.id !== excludeTaskId)?.id;
}

/**
 * Reposition a task, resolving move_to_top and move_to_bottom against its real list.
 *
 * @param client - API client.
 * @param params - Validated parameters.
 * @returns A human-readable description of what was done.
 * @throws McpError if the move cannot be performed, rather than reporting a false success.
 */
export async function repositionTask(
  client: ProductiveAPIClient,
  params: RepositionParams
): Promise<string> {
  const taskId = params.task_id as string;

  if (params.move_before_id || params.move_after_id) {
    const attributes: TaskReposition = {};
    if (params.move_before_id) attributes.move_before_id = params.move_before_id;
    if (params.move_after_id) attributes.move_after_id = params.move_after_id;
    await client.repositionTask(taskId, attributes);
    return params.move_before_id
      ? `Task ${taskId} moved before task ${params.move_before_id}.`
      : `Task ${taskId} moved after task ${params.move_after_id}.`;
  }

  const end = params.move_to_top ? 'top' : 'bottom';

  // The include is load-bearing. Without it the relationship is {"meta":{"included":false}}
  // and the list ID silently reads as undefined, which is what broke this tool before.
  const { data: task } = await client.getTask(taskId, 'task_list');
  const taskListId = task.relationships?.task_list?.data?.id;

  if (!taskListId) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Task ${taskId} is not in a task list, so it cannot be moved to the ${end} of one. ` +
        `Use move_before_id or move_after_id to position it against a specific task.`
    );
  }

  const anchorId = await findEdgeTask(client, taskListId, end, taskId);

  if (!anchorId) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Task ${taskId} is the only task in task list ${taskListId}, so there is nothing to ` +
        `move it ${end === 'top' ? 'above' : 'below'}. It is already at the ${end}.`
    );
  }

  await client.repositionTask(
    taskId,
    end === 'top' ? { move_before_id: anchorId } : { move_after_id: anchorId }
  );

  return `Task ${taskId} moved to the ${end} of task list ${taskListId} (${
    end === 'top' ? 'before' : 'after'
  } task ${anchorId}).`;
}

export async function taskRepositionTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = taskRepositionSchema.parse(args);
    const summary = await repositionTask(client, params);

    return { content: [{ type: 'text', text: summary }] };
  } catch (error) {
    // Previously this returned the error as ordinary text, so a failed reposition was
    // indistinguishable from a successful one.
    throw toMcpError(error);
  }
}

export const taskRepositionDefinition = {
  name: 'reposition_task',
  description:
    'Move a task within its task list. Provide exactly one of move_before_id, move_after_id, ' +
    'move_to_top or move_to_bottom. move_to_top and move_to_bottom resolve against the task\'s ' +
    'own task list, and fail rather than reporting success if the task is not in a list.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'The ID of the task to reposition (required)',
      },
      move_before_id: {
        type: 'string',
        description: 'Position the task before this task ID',
      },
      move_after_id: {
        type: 'string',
        description: 'Position the task after this task ID',
      },
      move_to_top: {
        type: 'boolean',
        description: 'Move the task to the top of its own task list',
      },
      move_to_bottom: {
        type: 'boolean',
        description: 'Move the task to the bottom of its own task list',
      },
    },
    required: ['task_id'],
  },
};
