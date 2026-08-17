/**
 * @fileoverview Tests for the get_task_overview single-call briefing tool.
 * @module tools/__tests__/task-overview.test
 */

import { describe, it, expect, vi } from 'vitest';
import { getTaskOverviewTool } from '../task-overview.js';
import { ProductiveAPIClient } from '../../api/client.js';

interface StubOptions {
  taskAttributes?: Record<string, unknown>;
  taskRelationships?: Record<string, unknown>;
  taskIncluded?: Array<Record<string, unknown>>;
  comments?: Array<Record<string, unknown>>;
  commentsIncluded?: Array<Record<string, unknown>>;
  totalComments?: number;
}

/** Build a client stub whose two calls mirror the JSON:API shapes Productive returns. */
function makeClient(options: StubOptions = {}) {
  const getTask = vi.fn().mockResolvedValue({
    data: {
      id: '555',
      type: 'tasks',
      attributes: {
        title: 'Renewal email not sending',
        description: '<p>Members report no renewal email.</p>',
        created_at: '2026-08-01T09:00:00+10:00',
        closed: false,
        ...options.taskAttributes,
      },
      relationships: {
        assignee: { data: { id: '10', type: 'people' } },
        ...options.taskRelationships,
      },
    },
    included: options.taskIncluded ?? [
      { id: '10', type: 'people', attributes: { first_name: 'Jay', last_name: 'McCormack' } },
    ],
  });

  const listComments = vi.fn().mockResolvedValue({
    data: options.comments ?? [],
    included: options.commentsIncluded ?? [],
    meta: { total_count: options.totalComments ?? (options.comments?.length ?? 0) },
  });

  return { getTask, listComments } as unknown as ProductiveAPIClient & {
    getTask: ReturnType<typeof vi.fn>;
    listComments: ReturnType<typeof vi.fn>;
  };
}

function makeComment(
  id: string,
  body: string | null,
  createdAt: string,
  extras: Record<string, unknown> = {}
) {
  return {
    id,
    type: 'comments',
    attributes: { body, created_at: createdAt, commentable_type: 'task', updated_at: createdAt },
    relationships: { creator: { data: { id: '10', type: 'people' } } },
    ...extras,
  };
}

async function runTool(client: ProductiveAPIClient, args: unknown): Promise<string> {
  const result = await getTaskOverviewTool(client, args);
  return result.content[0].text;
}

describe('getTaskOverviewTool', () => {
  it('fetches the task and its comments in exactly two calls', async () => {
    const client = makeClient();
    await runTool(client, { task_id: '555' });

    expect(client.getTask).toHaveBeenCalledTimes(1);
    expect(client.listComments).toHaveBeenCalledTimes(1);
  });

  it('requests the most recent comments newest-first so the newest are kept', async () => {
    const client = makeClient();
    await runTool(client, { task_id: '555', comment_limit: 25 });

    expect(client.listComments).toHaveBeenCalledWith({
      task_id: '555',
      sort: '-created_at',
      limit: 25,
    });
  });

  it('defaults to the ten most recent comments', async () => {
    const client = makeClient();
    await runTool(client, { task_id: '555' });

    expect(client.listComments).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 })
    );
  });

  it('reverses the API order so comments read oldest to newest', async () => {
    const client = makeClient({
      comments: [
        makeComment('3', '<p>newest</p>', '2026-08-03T09:00:00+10:00'),
        makeComment('2', '<p>middle</p>', '2026-08-02T09:00:00+10:00'),
        makeComment('1', '<p>oldest</p>', '2026-08-01T09:00:00+10:00'),
      ],
    });

    const text = await runTool(client, { task_id: '555' });

    expect(text.indexOf('oldest')).toBeLessThan(text.indexOf('middle'));
    expect(text.indexOf('middle')).toBeLessThan(text.indexOf('newest'));
    expect(text).toContain('[1]');
    expect(text).toContain('[3]');
  });

  it('returns comment bodies in full without truncation', async () => {
    const longBody = 'y'.repeat(3000);
    const client = makeClient({
      comments: [makeComment('1', `<p>${longBody}</p>`, '2026-08-01T09:00:00+10:00')],
    });

    const text = await runTool(client, { task_id: '555' });

    expect(text).toContain(longBody);
    expect(text).not.toContain('...');
  });

  it('renders stored mention blobs as readable names', async () => {
    const blob =
      '@[{"type":"person","id":"705374","label":"Julian Smith","avatar_url":null,"attachment_url":null,"is_done":false}]';
    const client = makeClient({
      comments: [makeComment('1', `<p>${blob} please review</p>`, '2026-08-01T09:00:00+10:00')],
    });

    const text = await runTool(client, { task_id: '555' });

    expect(text).toContain('@Julian Smith please review');
    expect(text).not.toContain('avatar_url');
  });

  it('indexes attachments from both the task and its comments with image flags', async () => {
    const client = makeClient({
      taskRelationships: {
        assignee: { data: { id: '10', type: 'people' } },
        attachments: { data: [{ id: '900', type: 'attachments' }] },
      },
      taskIncluded: [
        { id: '10', type: 'people', attributes: { first_name: 'Jay', last_name: 'McCormack' } },
        {
          id: '900',
          type: 'attachments',
          attributes: { name: 'spec.pdf', content_type: 'application/pdf', size: 2048 },
        },
      ],
      comments: [
        makeComment('1', '<p>see screenshot</p>', '2026-08-02T09:00:00+10:00', {
          relationships: {
            creator: { data: { id: '10', type: 'people' } },
            attachments: { data: [{ id: '901', type: 'attachments' }] },
          },
        }),
      ],
      commentsIncluded: [
        { id: '10', type: 'people', attributes: { first_name: 'Jay', last_name: 'McCormack' } },
        {
          id: '901',
          type: 'attachments',
          attributes: { name: 'error.png', content_type: 'image/png', size: 4096 },
        },
      ],
    });

    const text = await runTool(client, { task_id: '555' });

    expect(text).toContain('spec.pdf');
    expect(text).toContain('error.png');
    expect(text).toContain('[IMAGE]');
    expect(text).toContain('2 attachments, 1 of them image');
    expect(text).toContain('get_attachment');
    expect(text).toContain('on the task itself');
    expect(text).toContain('on comment 1');
  });

  it('reports when no attachments are present', async () => {
    const client = makeClient({
      comments: [makeComment('1', '<p>no files here</p>', '2026-08-01T09:00:00+10:00')],
    });

    const text = await runTool(client, { task_id: '555' });

    expect(text).toContain('None on this task or in the comments shown');
  });

  it('flags hidden and pinned comments', async () => {
    const client = makeClient({
      comments: [
        makeComment('1', '<p>internal note</p>', '2026-08-01T09:00:00+10:00', {
          attributes: {
            body: '<p>internal note</p>',
            created_at: '2026-08-01T09:00:00+10:00',
            commentable_type: 'task',
            updated_at: '2026-08-01T09:00:00+10:00',
            hidden: true,
            pinned_at: '2026-08-01T10:00:00+10:00',
          },
        }),
      ],
    });

    const text = await runTool(client, { task_id: '555' });

    expect(text).toContain('[PINNED]');
    expect(text).toContain('[INTERNAL - not client visible]');
  });

  it('handles attachment-only comments that have a null body', async () => {
    const client = makeClient({
      comments: [makeComment('1', null, '2026-08-01T09:00:00+10:00')],
    });

    const text = await runTool(client, { task_id: '555' });

    expect(text).toContain('attachment-only or system-generated');
  });

  it('says how many comments exist when more than the limit were returned', async () => {
    const client = makeClient({
      comments: [makeComment('1', '<p>only one shown</p>', '2026-08-01T09:00:00+10:00')],
      totalComments: 34,
    });

    const text = await runTool(client, { task_id: '555' });

    expect(text).toContain('showing the 1 most recent of 34');
  });

  it('states plainly when a task has no comments', async () => {
    const client = makeClient();
    const text = await runTool(client, { task_id: '555' });

    expect(text).toContain('No comments on this task');
  });

  it('includes headline metadata and the full description', async () => {
    const client = makeClient({
      taskAttributes: { task_number: 342, due_date: '2026-08-20', worked_time: 120 },
      taskRelationships: {
        assignee: { data: { id: '10', type: 'people' } },
        workflow_status: { data: { id: '77', type: 'workflow_statuses' } },
        project: { data: { id: '88', type: 'projects' } },
      },
      taskIncluded: [
        { id: '10', type: 'people', attributes: { first_name: 'Jay', last_name: 'McCormack' } },
        { id: '77', type: 'workflow_statuses', attributes: { name: 'In Progress' } },
        { id: '88', type: 'projects', attributes: { name: 'LNP Hub' } },
      ],
    });

    const text = await runTool(client, { task_id: '555' });

    expect(text).toContain('TASK 555: Renewal email not sending');
    expect(text).toContain('Status: In Progress');
    expect(text).toContain('Assignee: Jay McCormack (ID: 10)');
    expect(text).toContain('Project: LNP Hub (ID: 88)');
    expect(text).toContain('Task number: 342');
    expect(text).toContain('Due: 2026-08-20');
    expect(text).toContain('Members report no renewal email.');
  });

  it('rejects a missing task_id with an invalid-params error', async () => {
    const client = makeClient();
    await expect(getTaskOverviewTool(client, {})).rejects.toThrow(/Invalid parameters/);
    await expect(getTaskOverviewTool(client, { task_id: '' })).rejects.toThrow(/Task ID is required/);
  });

  it('rejects a comment_limit above the supported maximum', async () => {
    const client = makeClient();
    await expect(
      getTaskOverviewTool(client, { task_id: '555', comment_limit: 500 })
    ).rejects.toThrow(/Invalid parameters/);
  });
});
