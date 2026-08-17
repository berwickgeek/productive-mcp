/**
 * @fileoverview Regression guard: get_task, list_subtasks and update_task_status must go
 *               through ProductiveAPIClient rather than a raw fetch, so they inherit the
 *               JSON:API error diagnostics added in PR #28 instead of returning an opaque
 *               `statusText`. Also pins the request shape each tool asks the client for.
 * @module tools/__tests__/task-tools-client.test
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTaskTool } from '../tasks.js';
import { listSubtasksTool } from '../subtasks.js';
import { updateTaskStatusTool } from '../task-status.js';
import { ProductiveAPIClient, ProductiveApiError } from '../../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/** A 403 carrying the structured detail a raw `response.statusText` would have thrown away. */
const diagnosticError = new ProductiveApiError(
  'Forbidden (403): you do not have access to this task [at /data/relationships/project]',
  403,
  [{ status: '403', title: 'Forbidden', detail: 'you do not have access to this task', source: { pointer: '/data/relationships/project' } }]
);

/** A 404 from passing a task ID that does not exist: the caller's fault, not the server's. */
const notFoundError = new ProductiveApiError(
  'Record Not Found (404): The requested record was not found',
  404,
  [{ status: '404', title: 'Record Not Found', detail: 'The requested record was not found' }]
);

function mockClient(overrides: Record<string, unknown>): ProductiveAPIClient {
  return overrides as unknown as ProductiveAPIClient;
}

/** Runs `fn` and returns the McpError it threw. */
async function codeOf(fn: () => Promise<unknown>): Promise<McpError> {
  try {
    await fn();
  } catch (err) {
    return err as McpError;
  }
  throw new Error('expected a throw, got none');
}

describe('getTaskTool', () => {
  it('fetches through the client with the relationships it later reads', async () => {
    const getTask = vi.fn().mockResolvedValue({
      data: {
        id: '19300600',
        type: 'tasks',
        attributes: { title: 'Suspended members getting emails/notices', closed: false, created_at: '2026-07-31T01:52:54Z', updated_at: '2026-08-13T08:53:15Z' },
        relationships: {},
      },
      included: [],
    });

    const result = await getTaskTool(mockClient({ getTask }), { task_id: '19300600' });

    expect(getTask).toHaveBeenCalledWith('19300600', 'task_list,assignee,workflow_status,attachments');
    expect(result.content[0].text).toContain('Suspended members getting emails/notices');
  });

  it('surfaces the JSON:API diagnostics on failure', async () => {
    const client = mockClient({ getTask: vi.fn().mockRejectedValue(diagnosticError) });

    let caught: any;
    try {
      await getTaskTool(client, { task_id: '19300600' });
    } catch (err) {
      caught = err;
    }

    expect(caught.message).toContain('you do not have access to this task');
    expect(caught.message).toContain('/data/relationships/project');
  });
});

describe('listSubtasksTool', () => {
  it('asks the client for tasks filtered by parent, honouring limit and page', async () => {
    const listTasks = vi.fn().mockResolvedValue({
      data: [{ id: '2', type: 'tasks', attributes: { title: 'Child task', status: 1 }, relationships: {} }],
      included: [],
      meta: { total_count: 1 },
    });

    const result = await listSubtasksTool(mockClient({ listTasks }), {
      parent_task_id: '19300600',
      limit: 5,
      page: 2,
    });

    expect(listTasks).toHaveBeenCalledWith({ parent_task_id: '19300600', limit: 5, page: 2 });
    expect(result.content[0].text).toContain('Child task');
  });

  it('defaults limit to 30 and page to 1', async () => {
    const listTasks = vi.fn().mockResolvedValue({ data: [] });

    await listSubtasksTool(mockClient({ listTasks }), { parent_task_id: '19300600' });

    expect(listTasks).toHaveBeenCalledWith({ parent_task_id: '19300600', limit: 30, page: 1 });
  });

  it('surfaces the JSON:API diagnostics on failure', async () => {
    const client = mockClient({ listTasks: vi.fn().mockRejectedValue(diagnosticError) });

    let caught: any;
    try {
      await listSubtasksTool(client, { parent_task_id: '19300600' });
    } catch (err) {
      caught = err;
    }

    expect(caught.message).toContain('you do not have access to this task');
  });
});

describe('updateTaskStatusTool', () => {
  /** task -> project -> workflow -> statuses, all via the client. */
  function statusResolvingClient() {
    return {
      getTask: vi.fn().mockResolvedValue({
        data: { id: '19300600', relationships: { project: { data: { id: '813033', type: 'projects' } } } },
      }),
      getProject: vi.fn().mockResolvedValue({
        data: { id: '813033', relationships: { workflow: { data: { id: '77', type: 'workflows' } } } },
      }),
      listWorkflowStatuses: vi.fn().mockResolvedValue({
        data: [
          { id: '901', type: 'workflow_statuses', attributes: { name: 'In Progress', category_id: 2 } },
          { id: '902', type: 'workflow_statuses', attributes: { name: 'Done', category_id: 3 } },
        ],
      }),
      updateTask: vi.fn().mockResolvedValue({
        data: { id: '19300600', attributes: { title: 'Suspended members getting emails/notices', closed: false } },
      }),
    };
  }

  it('resolves a status name through the client and applies it', async () => {
    const c = statusResolvingClient();

    const result = await updateTaskStatusTool(mockClient(c), {
      task_id: '19300600',
      status_name: 'in progress',
    });

    expect(c.getTask).toHaveBeenCalledWith('19300600', 'project');
    expect(c.getProject).toHaveBeenCalledWith('813033', 'workflow');
    expect(c.listWorkflowStatuses).toHaveBeenCalledWith({ workflow_id: '77', limit: 200 });
    expect(c.updateTask).toHaveBeenCalledWith(
      '19300600',
      expect.objectContaining({
        data: expect.objectContaining({
          relationships: { workflow_status: { data: { id: '901', type: 'workflow_statuses' } } },
        }),
      })
    );
    expect(result.content[0].text).toContain('In Progress');
  });

  it('skips resolution entirely when a workflow_status_id is given', async () => {
    const c = statusResolvingClient();

    await updateTaskStatusTool(mockClient(c), { task_id: '19300600', workflow_status_id: '902' });

    expect(c.getTask).not.toHaveBeenCalled();
    expect(c.updateTask).toHaveBeenCalled();
  });

  it('surfaces the JSON:API diagnostics when resolution fails', async () => {
    const c = { ...statusResolvingClient(), getTask: vi.fn().mockRejectedValue(diagnosticError) };

    let caught: any;
    try {
      await updateTaskStatusTool(mockClient(c), { task_id: '19300600', status_name: 'Done' });
    } catch (err) {
      caught = err;
    }

    expect(caught.message).toContain('you do not have access to this task');
    expect(caught.message).toContain('/data/relationships/project');
  });
});

describe('error codes at the tool boundary', () => {
  // Before this, all three collapsed every failure into InternalError, so a caller could not
  // tell "you passed an ID that does not exist" from "Productive fell over".
  it('reports a bad task_id as InvalidParams from get_task', async () => {
    const err = await codeOf(() =>
      getTaskTool(mockClient({ getTask: vi.fn().mockRejectedValue(notFoundError) }), { task_id: '1' })
    );

    expect(err.code).toBe(ErrorCode.InvalidParams);
    expect(err.message).toContain('Record Not Found');
  });

  it('reports a bad parent_task_id as InvalidParams from list_subtasks', async () => {
    const err = await codeOf(() =>
      listSubtasksTool(mockClient({ listTasks: vi.fn().mockRejectedValue(notFoundError) }), { parent_task_id: '1' })
    );

    expect(err.code).toBe(ErrorCode.InvalidParams);
  });

  it('reports a rejected status change as InvalidParams from update_task_status', async () => {
    const rejected = new ProductiveApiError('Invalid relationship (422): not on this workflow', 422, [
      { status: '422', title: 'Invalid relationship' },
    ]);
    const err = await codeOf(() =>
      updateTaskStatusTool(mockClient({ updateTask: vi.fn().mockRejectedValue(rejected) }), {
        task_id: '19300600',
        workflow_status_id: '999',
      })
    );

    expect(err.code).toBe(ErrorCode.InvalidParams);
  });

  it('still reports a permission failure as InternalError, not the caller\'s fault', async () => {
    const err = await codeOf(() =>
      getTaskTool(mockClient({ getTask: vi.fn().mockRejectedValue(diagnosticError) }), { task_id: '1' })
    );

    expect(err.code).toBe(ErrorCode.InternalError);
    expect(err.message).toContain('you do not have access to this task');
  });

  it('keeps update_task_status\'s own argument check as InvalidParams', async () => {
    const err = await codeOf(() =>
      updateTaskStatusTool(mockClient({}), { task_id: '19300600' })
    );

    expect(err.code).toBe(ErrorCode.InvalidParams);
    expect(err.message).toContain('workflow_status_id or status_name');
  });
});

describe('tool layer', () => {
  it('never calls fetch directly, so every request carries client error handling', () => {
    // Not import.meta.dirname: that needs Node >= 20.11 and package.json allows >= 18.
    const toolsDir = fileURLToPath(new URL('..', import.meta.url));
    const offenders = readdirSync(toolsDir)
      .filter(f => f.endsWith('.ts'))
      .filter(f => /(?<!\w)fetch\s*\(/.test(readFileSync(join(toolsDir, f), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('never maps errors inline, so a caller fault is never reported as a server fault', () => {
    const toolsDir = fileURLToPath(new URL('..', import.meta.url));
    const offenders = readdirSync(toolsDir)
      .filter(f => f.endsWith('.ts'))
      .filter(f => readFileSync(join(toolsDir, f), 'utf8').includes('ErrorCode.InternalError'));

    expect(offenders).toEqual([]);
  });
});
