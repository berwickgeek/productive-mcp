/**
 * @fileoverview Guards the confirmation gate on every delete tool.
 *
 * The assertion that matters is not that a preview is returned, it is that the delete method
 * is never reached without `confirm: true`. Annotations are hints a client may ignore; this
 * gate does not depend on the client honouring anything.
 *
 * @module tools/__tests__/delete-confirm.test
 */

import { describe, it, expect, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveAPIClient, ProductiveApiError } from '../../api/client.js';
import { deleteTaskTool, deleteTaskDefinition } from '../tasks.js';
import { deleteCommentTool, deleteCommentDefinition } from '../comments.js';
import { deletePageTool, deletePageDefinition } from '../pages.js';
import { deleteTodoTool, deleteTodoDefinition } from '../todos.js';
import { deleteTaskDependencyTool, deleteTaskDependencyDefinition } from '../task-dependencies.js';

function mockClient(overrides: Record<string, unknown>): ProductiveAPIClient {
  return overrides as unknown as ProductiveAPIClient;
}

/**
 * Every gated delete tool, with a lookup stub shaped like the record it fetches and the
 * argument name it takes.
 */
const CASES = [
  {
    name: 'delete_task',
    tool: deleteTaskTool,
    definition: deleteTaskDefinition,
    args: { task_id: '19300600' },
    getter: 'getTask',
    deleter: 'deleteTask',
    record: {
      data: {
        id: '19300600',
        attributes: { title: 'Suspended members getting emails/notices', task_number: 407, closed: false },
        relationships: { project: { data: { id: '813033' } } },
      },
    },
    expectInPreview: 'Suspended members getting emails/notices',
  },
  {
    name: 'delete_comment',
    tool: deleteCommentTool,
    definition: deleteCommentDefinition,
    args: { comment_id: '16843014' },
    getter: 'getComment',
    deleter: 'deleteComment',
    record: {
      data: {
        id: '16843014',
        attributes: { body: '<p>Quick update on Cameron</p>', commentable_type: 'task', created_at: '2026-08-13' },
        relationships: { task: { data: { id: '19300600' } } },
      },
    },
    expectInPreview: 'Quick update on Cameron',
  },
  {
    name: 'delete_page',
    tool: deletePageTool,
    definition: deletePageDefinition,
    args: { page_id: '55' },
    getter: 'getPage',
    deleter: 'deletePage',
    record: { data: { id: '55', attributes: { title: 'Runbook', body: '<p>Steps</p>' } } },
    expectInPreview: 'Runbook',
  },
  {
    name: 'delete_todo',
    tool: deleteTodoTool,
    definition: deleteTodoDefinition,
    args: { todo_id: '77' },
    getter: 'getTodo',
    deleter: 'deleteTodo',
    record: { data: { id: '77', attributes: { description: 'Chase Nick', closed: false, due_date: '2026-08-20' } } },
    expectInPreview: 'Chase Nick',
  },
  {
    name: 'delete_task_dependency',
    tool: deleteTaskDependencyTool,
    definition: deleteTaskDependencyDefinition,
    args: { dependency_id: '9' },
    getter: 'getTaskDependency',
    deleter: 'deleteTaskDependency',
    record: {
      data: {
        id: '9',
        attributes: { type_id: 1 },
        relationships: { task: { data: { id: '1' } }, dependent_task: { data: { id: '2' } } },
      },
    },
    expectInPreview: 'Dependent task ID: 2',
  },
] as const;

describe.each(CASES)('$name confirmation gate', (c) => {
  /** A client whose lookup succeeds and whose delete is spied on. */
  function client() {
    return {
      [c.getter]: vi.fn().mockResolvedValue(c.record),
      [c.deleter]: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('does not delete when confirm is omitted', async () => {
    const spy = client();

    await c.tool(mockClient(spy), { ...c.args });

    expect(spy[c.deleter]).not.toHaveBeenCalled();
  });

  it('does not delete when confirm is explicitly false', async () => {
    const spy = client();

    await c.tool(mockClient(spy), { ...c.args, confirm: false });

    expect(spy[c.deleter]).not.toHaveBeenCalled();
  });

  it('describes the record rather than just echoing the ID back', async () => {
    const spy = client();

    const result = await c.tool(mockClient(spy), { ...c.args });
    const text = result.content[0].text;

    expect(text).toContain(c.expectInPreview);
    expect(text).toContain('Nothing has been deleted yet');
    expect(text).toContain('"confirm": true');
    expect(spy[c.getter]).toHaveBeenCalled();
  });

  it('deletes once confirm is true', async () => {
    const spy = client();

    await c.tool(mockClient(spy), { ...c.args, confirm: true });

    expect(spy[c.deleter]).toHaveBeenCalledTimes(1);
  });

  it('skips the lookup entirely when confirmed, so confirming costs no extra call', async () => {
    const spy = client();

    await c.tool(mockClient(spy), { ...c.args, confirm: true });

    expect(spy[c.getter]).not.toHaveBeenCalled();
  });

  it('surfaces a bad ID at preview time, before anything is destroyed', async () => {
    const notFound = new ProductiveApiError('Record Not Found (404): no such record', 404, [
      { status: '404', title: 'Record Not Found' },
    ]);
    const spy = {
      [c.getter]: vi.fn().mockRejectedValue(notFound),
      [c.deleter]: vi.fn(),
    };

    let caught: any;
    try {
      await c.tool(mockClient(spy), { ...c.args });
    } catch (err) {
      caught = err;
    }

    expect(caught.code).toBe(ErrorCode.InvalidParams);
    expect(spy[c.deleter]).not.toHaveBeenCalled();
  });

  it('advertises confirm in its input schema and description', () => {
    expect(c.definition.inputSchema.properties).toHaveProperty('confirm');
    expect(c.definition.description).toContain('confirm');
    // Not required, so the safe path is the default rather than something to opt into.
    expect(c.definition.inputSchema.required).not.toContain('confirm');
  });
});
