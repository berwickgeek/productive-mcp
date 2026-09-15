/**
 * @fileoverview Tests reposition_task.
 *
 * The old implementation reported success in three situations where it had done nothing
 * useful: when the API call failed, when it could not find an anchor task, and when it
 * positioned against unrelated tasks from other lists. Each has a test here.
 *
 * @module tools/__tests__/task-reposition.test
 */

import { describe, it, expect, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveAPIClient, ProductiveApiError } from '../../api/client.js';
import { taskRepositionTool } from '../task-reposition.js';

function mockClient(overrides: Record<string, unknown>): ProductiveAPIClient {
  return overrides as unknown as ProductiveAPIClient;
}

/** A task that lives in list 2753083. */
const taskInList = {
  data: { id: '19300600', relationships: { task_list: { data: { id: '2753083' } } } },
};

/** What the API returns when a relationship was not requested via include. */
const taskWithoutInclude = {
  data: { id: '19300600', relationships: { task_list: { meta: { included: false } } } },
};

function workingClient() {
  return {
    getTask: vi.fn().mockResolvedValue(taskInList),
    listTasks: vi.fn().mockResolvedValue({ data: [{ id: '111' }, { id: '222' }] }),
    repositionTask: vi.fn().mockResolvedValue({ success: true }),
  };
}

async function errorOf(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    return err as { code: number; message: string };
  }
  throw new Error('expected a throw, got none');
}

describe('move_to_top and move_to_bottom', () => {
  it('resolves the task list with an include, or the ID silently reads as undefined', async () => {
    const c = workingClient();

    await taskRepositionTool(mockClient(c), { task_id: '19300600', move_to_top: true });

    expect(c.getTask).toHaveBeenCalledWith('19300600', 'task_list');
  });

  it('asks the API for the top task of that list only, sorted, rather than scanning a page', async () => {
    const c = workingClient();

    await taskRepositionTool(mockClient(c), { task_id: '19300600', move_to_top: true });

    expect(c.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ task_list_id: '2753083', sort: 'placement' })
    );
    expect(c.repositionTask).toHaveBeenCalledWith('19300600', { move_before_id: '111' });
  });

  it('sorts descending for move_to_bottom and positions after', async () => {
    const c = workingClient();

    await taskRepositionTool(mockClient(c), { task_id: '19300600', move_to_bottom: true });

    expect(c.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ task_list_id: '2753083', sort: '-placement' })
    );
    expect(c.repositionTask).toHaveBeenCalledWith('19300600', { move_after_id: '111' });
  });

  it('never anchors a task against itself', async () => {
    const c = {
      ...workingClient(),
      listTasks: vi.fn().mockResolvedValue({ data: [{ id: '19300600' }, { id: '222' }] }),
    };

    await taskRepositionTool(mockClient(c), { task_id: '19300600', move_to_top: true });

    expect(c.repositionTask).toHaveBeenCalledWith('19300600', { move_before_id: '222' });
  });

  it('fails instead of claiming success when the task is in no list', async () => {
    const c = { ...workingClient(), getTask: vi.fn().mockResolvedValue(taskWithoutInclude) };

    const err = await errorOf(() =>
      taskRepositionTool(mockClient(c), { task_id: '19300600', move_to_top: true })
    );

    expect(err.code).toBe(ErrorCode.InvalidParams);
    expect(err.message).toContain('not in a task list');
    expect(c.repositionTask).not.toHaveBeenCalled();
  });

  it('fails instead of sending empty attributes when the list holds only this task', async () => {
    const c = {
      ...workingClient(),
      listTasks: vi.fn().mockResolvedValue({ data: [{ id: '19300600' }] }),
    };

    const err = await errorOf(() =>
      taskRepositionTool(mockClient(c), { task_id: '19300600', move_to_bottom: true })
    );

    expect(err.code).toBe(ErrorCode.InvalidParams);
    expect(err.message).toContain('only task');
    expect(c.repositionTask).not.toHaveBeenCalled();
  });
});

describe('explicit positioning', () => {
  it('passes move_before_id straight through without a lookup', async () => {
    const c = workingClient();

    await taskRepositionTool(mockClient(c), { task_id: '1', move_before_id: '2' });

    expect(c.repositionTask).toHaveBeenCalledWith('1', { move_before_id: '2' });
    expect(c.getTask).not.toHaveBeenCalled();
  });

  it('passes move_after_id straight through', async () => {
    const c = workingClient();

    await taskRepositionTool(mockClient(c), { task_id: '1', move_after_id: '2' });

    expect(c.repositionTask).toHaveBeenCalledWith('1', { move_after_id: '2' });
  });
});

describe('argument handling', () => {
  it('accepts the deprecated camelCase names so existing callers keep working', async () => {
    const c = workingClient();

    await taskRepositionTool(mockClient(c), { taskId: '19300600', moveToTop: true });

    expect(c.repositionTask).toHaveBeenCalledWith('19300600', { move_before_id: '111' });
  });

  it('rejects a call with no positioning instruction, which used to be a silent no-op', async () => {
    const c = workingClient();

    const err = await errorOf(() => taskRepositionTool(mockClient(c), { task_id: '1' }));

    expect(err.code).toBe(ErrorCode.InvalidParams);
    expect(c.repositionTask).not.toHaveBeenCalled();
  });

  it('rejects contradictory instructions rather than picking one', async () => {
    const c = workingClient();

    const err = await errorOf(() =>
      taskRepositionTool(mockClient(c), { task_id: '1', move_to_top: true, move_after_id: '2' })
    );

    expect(err.code).toBe(ErrorCode.InvalidParams);
    expect(c.repositionTask).not.toHaveBeenCalled();
  });

  it('requires a task_id', async () => {
    const err = await errorOf(() => taskRepositionTool(mockClient({}), { move_to_top: true }));

    expect(err.code).toBe(ErrorCode.InvalidParams);
  });
});

describe('failures', () => {
  it('throws instead of returning the error as ordinary text', async () => {
    const c = {
      ...workingClient(),
      repositionTask: vi.fn().mockRejectedValue(
        new ProductiveApiError('Record Not Found (404): no such task', 404, [
          { status: '404', title: 'Record Not Found' },
        ])
      ),
    };

    const err = await errorOf(() =>
      taskRepositionTool(mockClient(c), { task_id: '1', move_before_id: '2' })
    );

    expect(err.code).toBe(ErrorCode.InvalidParams);
    expect(err.message).toContain('Record Not Found');
  });

  it('reports a server fault as InternalError', async () => {
    const c = {
      ...workingClient(),
      repositionTask: vi.fn().mockRejectedValue(new ProductiveApiError('boom', 500, [])),
    };

    const err = await errorOf(() =>
      taskRepositionTool(mockClient(c), { task_id: '1', move_after_id: '2' })
    );

    expect(err.code).toBe(ErrorCode.InternalError);
  });
});
