/**
 * @fileoverview Tests the tools that name a board but must send a folder.
 *
 * Productive renamed the board concept to folder. The MCP tool arguments still say board_id,
 * so nothing at the tool boundary changes, but every request body and every relationship read
 * must use folder. Verified against the live API on 2026-09-15: a task_lists body carrying
 * relationships.board is rejected with 422 "folder can't be blank".
 *
 * @module tools/__tests__/board-folder-rename.test
 */

import { describe, it, expect, vi } from 'vitest';
import { ProductiveAPIClient } from '../../api/client.js';
import { createTaskList, listTaskLists } from '../task-lists.js';
import { createTaskTool } from '../tasks.js';

function mockClient(overrides: Record<string, unknown>): ProductiveAPIClient {
  return overrides as unknown as ProductiveAPIClient;
}

describe('create_task_list', () => {
  it('sends a folder relationship, not a board one', async () => {
    const createTaskListSpy = vi.fn().mockResolvedValue({
      data: { id: '1', attributes: { name: 'Sprint 1' } },
    });

    await createTaskList(mockClient({ createTaskList: createTaskListSpy }), {
      board_id: '576568',
      project_id: '813033',
      name: 'Sprint 1',
    });

    const body = createTaskListSpy.mock.calls[0][0];
    expect(body.data.relationships.folder).toEqual({
      data: { id: '576568', type: 'folders' },
    });
    expect(body.data.relationships.board).toBeUndefined();
  });
});

describe('list_task_lists', () => {
  it('passes board_id through as the folder_id filter', async () => {
    const listTaskListsSpy = vi.fn().mockResolvedValue({ data: [] });

    await listTaskLists(mockClient({ listTaskLists: listTaskListsSpy }), { board_id: '576568' });

    expect(listTaskListsSpy).toHaveBeenCalledWith({ folder_id: '576568', limit: 30 });
  });

  it('reads the board id off the folder relationship', async () => {
    const listTaskListsSpy = vi.fn().mockResolvedValue({
      data: [
        {
          id: '1254639',
          attributes: { name: 'New list' },
          relationships: { folder: { data: { id: '576568', type: 'folders' } } },
        },
      ],
    });

    const result = await listTaskLists(mockClient({ listTaskLists: listTaskListsSpy }), {});

    expect(result.content[0].text).toContain('Board ID: 576568');
  });
});

describe('create_task', () => {
  it('does not send a board relationship, which the API ignores', async () => {
    const createTaskSpy = vi.fn().mockResolvedValue({
      data: { id: '19300600', attributes: { title: 'Probe', status: 1 } },
    });

    await createTaskTool(mockClient({ createTask: createTaskSpy }), {
      title: 'Probe',
      board_id: '576568',
      task_list_id: '2753083',
    });

    const body = createTaskSpy.mock.calls[0][0];
    expect(body.data.relationships.board).toBeUndefined();
    expect(body.data.relationships.folder).toBeUndefined();
    expect(body.data.relationships.task_list).toEqual({
      data: { id: '2753083', type: 'task_lists' },
    });
  });
});
