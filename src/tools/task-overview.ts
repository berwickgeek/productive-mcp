/**
 * @fileoverview Single-call briefing for a task: metadata, description, recent
 * comments in full, and a consolidated attachment index.
 * @module tools/task-overview
 */

import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveComment, ProductiveIncludedResource } from '../api/types.js';
import { htmlToText } from '../utils/html.js';
import { renderStoredMentions } from '../utils/mentions.js';

type ToolResult = { content: Array<{ type: string; text: string }> };

/** An attachment discovered on the task or one of its comments. */
interface AttachmentEntry {
  id: string;
  name: string;
  contentType: string;
  size: number | undefined;
  isImage: boolean;
  /** Where it hangs, e.g. "task" or "comment 900 by Sarah Lee, 2026-08-02". */
  source: string;
}

const getTaskOverviewSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  comment_limit: z.number().min(1).max(50).default(10).optional(),
});

const TASK_INCLUDES = 'assignee,creator,workflow_status,project,task_list,attachments';

function findIncluded(
  included: ProductiveIncludedResource[] | undefined,
  type: string,
  id: string | undefined
): ProductiveIncludedResource | undefined {
  if (!id || !included) return undefined;
  return included.find((item) => item.type === type && item.id === id);
}

function personName(
  included: ProductiveIncludedResource[] | undefined,
  id: string | undefined
): string | undefined {
  const person = findIncluded(included, 'people', id);
  if (!person) return undefined;
  const full = `${person.attributes.first_name || ''} ${person.attributes.last_name || ''}`.trim();
  return full || undefined;
}

/** Render "Name (ID: 123)", falling back to the bare ID, then to a placeholder. */
function personLabel(
  included: ProductiveIncludedResource[] | undefined,
  id: string | undefined,
  fallback: string
): string {
  if (!id) return fallback;
  const name = personName(included, id);
  return name ? `${name} (ID: ${id})` : `ID ${id}`;
}

/**
 * Resolve an owner's `attachments` relationship into structured entries and
 * append them to the running index.
 */
function collectAttachments(
  relationships: Record<string, any> | undefined,
  included: ProductiveIncludedResource[] | undefined,
  source: string,
  into: AttachmentEntry[]
): AttachmentEntry[] {
  const refs = relationships?.attachments?.data;
  if (!Array.isArray(refs) || refs.length === 0) return [];

  const entries = refs.map((ref: { id: string }) => {
    const att = findIncluded(included, 'attachments', ref.id);
    const attrs = att?.attributes ?? {};
    const contentType: string = attrs.content_type ?? 'unknown type';
    return {
      id: ref.id,
      name: attrs.name ?? 'unnamed',
      contentType,
      size: typeof attrs.size === 'number' ? attrs.size : undefined,
      isImage: contentType.startsWith('image/'),
      source,
    };
  });

  into.push(...entries);
  return entries;
}

function formatAttachmentLine(entry: AttachmentEntry, indent: string): string {
  const size = entry.size !== undefined ? `, ${entry.size} bytes` : '';
  const flag = entry.isImage ? ' [IMAGE - review this]' : '';
  return `${indent}- attachment ${entry.id}: ${entry.name} (${entry.contentType}${size})${flag}`;
}

/** Comment bodies are HTML with embedded mention blobs; render both to plain text. */
function renderBody(body: string | null | undefined): string {
  return htmlToText(renderStoredMentions(body));
}

function buildHeader(
  task: { id: string; attributes: Record<string, any>; relationships?: Record<string, any> },
  included: ProductiveIncludedResource[] | undefined
): string {
  const a = task.attributes;
  const rel = task.relationships;

  const workflowStatus = findIncluded(included, 'workflow_statuses', rel?.workflow_status?.data?.id);
  const status = workflowStatus?.attributes?.name || (a.closed ? 'closed' : 'open');
  const project = findIncluded(included, 'projects', rel?.project?.data?.id);
  const taskList = findIncluded(included, 'task_lists', rel?.task_list?.data?.id);

  const lines = [
    `TASK ${task.id}: ${a.title}`,
    `Status: ${status} | Assignee: ${personLabel(included, rel?.assignee?.data?.id, 'Unassigned')}`,
  ];

  const placement: string[] = [];
  if (project) placement.push(`Project: ${project.attributes.name} (ID: ${project.id})`);
  if (taskList) placement.push(`Task list: ${taskList.attributes.name} (ID: ${taskList.id})`);
  if (a.task_number) placement.push(`Task number: ${a.task_number}`);
  if (placement.length > 0) lines.push(placement.join(' | '));

  const dates: string[] = [];
  dates.push(`Created: ${a.created_at || 'unknown'} by ${personLabel(included, rel?.creator?.data?.id, 'unknown')}`);
  if (a.due_date) dates.push(`Due: ${a.due_date}`);
  if (a.last_activity_at) dates.push(`Last activity: ${a.last_activity_at}`);
  lines.push(dates.join(' | '));

  const effort: string[] = [];
  if (a.initial_estimate) effort.push(`Estimate: ${a.initial_estimate} min`);
  if (a.worked_time) effort.push(`Worked: ${a.worked_time} min`);
  if (a.private) effort.push('Private: yes');
  if (effort.length > 0) lines.push(effort.join(' | '));

  return lines.join('\n');
}

function buildCommentBlock(
  comment: ProductiveComment,
  position: number,
  included: ProductiveIncludedResource[] | undefined,
  attachmentIndex: AttachmentEntry[]
): string {
  const creatorId = comment.relationships?.creator?.data?.id;
  const author = personName(included, creatorId) || `Person ${creatorId || 'unknown'}`;
  const flags = [
    comment.attributes.pinned_at ? '[PINNED]' : '',
    comment.attributes.hidden ? '[INTERNAL - not client visible]' : '',
    comment.attributes.edited_at ? '[EDITED]' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const header = `[${position}] ${comment.attributes.created_at} | ${author} | comment ${comment.id}${flags ? ` ${flags}` : ''}`;
  const body = renderBody(comment.attributes.body) || '(no text; this comment is attachment-only or system-generated)';

  const own = collectAttachments(
    comment.relationships,
    included,
    `comment ${comment.id} by ${author}, ${comment.attributes.created_at}`,
    attachmentIndex
  );
  const attachmentText =
    own.length > 0
      ? `\n  Attachments on this comment (${own.length}):\n${own.map((e) => formatAttachmentLine(e, '  ')).join('\n')}`
      : '';

  return `${header}\n${body}${attachmentText}`;
}

function buildAttachmentIndex(entries: AttachmentEntry[]): string {
  if (entries.length === 0) {
    return 'ATTACHMENTS\nNone on this task or in the comments shown.';
  }

  const imageCount = entries.filter((e) => e.isImage).length;
  const summary =
    `${entries.length} attachment${entries.length === 1 ? '' : 's'}` +
    (imageCount > 0 ? `, ${imageCount} of them image${imageCount === 1 ? '' : 's'} (likely screenshots)` : '');

  const lines = entries.map((e) => {
    const size = e.size !== undefined ? `, ${e.size} bytes` : '';
    const flag = e.isImage ? ' [IMAGE]' : '';
    return `- ${e.id}: ${e.name} (${e.contentType}${size})${flag} | on ${e.source}`;
  });

  return (
    `ATTACHMENTS\n${summary}.\n` +
    `Call get_attachment with an ID below to download and view it. ` +
    `Images are returned inline, so review any screenshot that the task or a comment refers to.\n` +
    lines.join('\n')
  );
}

/**
 * Build a complete briefing for one task in a single tool call.
 *
 * Replaces the get_task then list_comments then get_comment round-trip loop:
 * comment bodies are returned in full (never truncated), ordered oldest to
 * newest so the thread reads as a narrative, and every attachment on the task
 * or its comments is indexed with the ID needed to fetch it.
 *
 * @param client - The Productive API client
 * @param args - Tool arguments validated against {@link getTaskOverviewSchema}
 * @returns A single text block containing metadata, description, comments and attachment index
 */
export async function getTaskOverviewTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<ToolResult> {
  try {
    const params = getTaskOverviewSchema.parse(args);
    const commentLimit = params.comment_limit ?? 10;

    // One round trip each, in parallel, instead of a call per comment.
    const [taskResponse, commentsResponse] = await Promise.all([
      client.getTask(params.task_id, TASK_INCLUDES),
      client.listComments({
        task_id: params.task_id,
        sort: '-created_at',
        limit: commentLimit,
      }),
    ]);

    const task = taskResponse.data;
    const attachmentIndex: AttachmentEntry[] = [];

    const sections: string[] = [buildHeader(task, taskResponse.included)];

    const description = renderBody(task.attributes.description);
    sections.push(`ORIGINAL TASK\n${description || '(no description)'}`);

    const taskAttachments = collectAttachments(
      task.relationships,
      taskResponse.included,
      'the task itself',
      attachmentIndex
    );
    if (taskAttachments.length > 0) {
      sections.push(
        `Attachments on the task (${taskAttachments.length}):\n` +
          taskAttachments.map((e) => formatAttachmentLine(e, '')).join('\n')
      );
    }

    // The API returns newest first; reverse so the thread reads in order.
    const comments = [...(commentsResponse.data ?? [])].reverse();
    const totalComments = commentsResponse.meta?.total_count;

    if (comments.length === 0) {
      sections.push('COMMENTS\nNo comments on this task.');
    } else {
      const scope =
        totalComments && totalComments > comments.length
          ? `showing the ${comments.length} most recent of ${totalComments}, oldest first`
          : `all ${comments.length}, oldest first`;
      const blocks = comments.map((comment, index) =>
        buildCommentBlock(comment, index + 1, commentsResponse.included, attachmentIndex)
      );
      sections.push(`COMMENTS (${scope})\n\n${blocks.join('\n\n')}`);
    }

    sections.push(buildAttachmentIndex(attachmentIndex));

    return {
      content: [{ type: 'text', text: sections.join('\n\n---\n\n') }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map((e) => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const getTaskOverviewDefinition = {
  name: 'get_task_overview',
  description:
    'START HERE when given a Productive task/issue ID. Returns a complete briefing in ONE call: ' +
    'task metadata (title, workflow status, assignee, project, task list, dates, estimate vs worked time), ' +
    'the full original description, and the most recent comments with their FULL text in chronological order ' +
    '(nothing is truncated). Every attachment on the task and on those comments is listed with its ID, flagged ' +
    'when it is an image, so you can fetch just the screenshots that matter with get_attachment. ' +
    'Use this instead of chaining get_task, list_comments and get_comment, which costs many round trips and truncates bodies.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'The ID of the task to summarise (required)',
      },
      comment_limit: {
        type: 'number',
        description: 'How many of the most recent comments to return in full (1-50, default 10)',
        minimum: 1,
        maximum: 50,
        default: 10,
      },
    },
    required: ['task_id'],
  },
};
