/**
 * @fileoverview Tests the changes made to cut MCP round trips and result size.
 *
 * Each case here corresponds to a pattern measured in 939 real Productive calls across 153
 * sessions: list results that blew the client's token cap, one-call-per-record write loops,
 * get_task called once per known ID, and comment-then-reassign as two calls.
 *
 * @module tools/__tests__/call-efficiency.test
 */

import { describe, it, expect, vi } from 'vitest';
import { ProductiveAPIClient } from '../../api/client.js';
import { listTasksTool } from '../tasks.js';
import { addTaskCommentTool } from '../comments.js';
import { createTimeEntriesTool } from '../time-entries.js';
import { getAttachmentTool } from '../attachments.js';
import { getProjectServicesTool } from '../time-entries.js';

function mockClient(overrides: Record<string, unknown>): ProductiveAPIClient {
  return overrides as unknown as ProductiveAPIClient;
}

/** The first text block of a tool result, which for attachments sits alongside image blocks. */
function textOf(result: { content: Array<{ type: string } & Record<string, unknown>> }): string {
  const block = result.content.find((b) => b.type === 'text');
  if (!block) throw new Error('no text block in result');
  return block.text as string;
}

/** A task whose description alone would dominate a list result. */
function taskWithLongDescription(id: string) {
  return {
    id,
    attributes: {
      title: `Task ${id}`,
      status: 1,
      description: `<p>${'x'.repeat(4000)}</p>`,
    },
    relationships: {},
  };
}

describe('list results stay small enough to be returned at all', () => {
  it('truncates task descriptions instead of printing them whole', async () => {
    const listTasks = vi.fn().mockResolvedValue({
      data: Array.from({ length: 50 }, (_, i) => taskWithLongDescription(String(i))),
    });

    const result = await listTasksTool(mockClient({ listTasks }), { limit: 50 });
    const text = result.content[0].text;

    // 50 tasks x 4000 chars of description would be 200,000 characters.
    expect(text.length).toBeLessThan(20000);
    expect(text).toContain('[truncated, 4000 chars total]');
    expect(text).toContain('Task 0 (ID: 0)');
  });

  it('does not emit blank filler lines for absent fields', async () => {
    const listTasks = vi.fn().mockResolvedValue({
      data: [{ id: '1', attributes: { title: 'Bare', status: 1 }, relationships: {} }],
    });

    const text = (await listTasksTool(mockClient({ listTasks }), {})).content[0].text;

    expect(text.split('\n').filter((line) => line.trim() === '' && line.length > 0)).toHaveLength(0);
    expect(text).not.toContain('Description:');
  });
});

describe('list_tasks task_ids', () => {
  it('sends the ids as one filtered request rather than one call per id', async () => {
    const listTasks = vi.fn().mockResolvedValue({ data: [] });

    await listTasksTool(mockClient({ listTasks }), { task_ids: ['1', '2', '3'] });

    expect(listTasks).toHaveBeenCalledTimes(1);
    expect(listTasks.mock.calls[0][0].task_ids).toEqual(['1', '2', '3']);
  });

  it('raises the page size to cover every id asked for', async () => {
    const listTasks = vi.fn().mockResolvedValue({ data: [] });
    const ids = Array.from({ length: 45 }, (_, i) => String(i));

    await listTasksTool(mockClient({ listTasks }), { task_ids: ids, limit: 30 });

    expect(listTasks.mock.calls[0][0].limit).toBe(45);
  });
});

describe('add_task_comment with assignee_id', () => {
  const comment = { data: { id: '900', attributes: { body: 'Done' } } };

  it('posts and reassigns in one call', async () => {
    const createComment = vi.fn().mockResolvedValue(comment);
    const updateTask = vi.fn().mockResolvedValue({ data: { id: '1', attributes: { title: 'T' } } });

    const result = await addTaskCommentTool(
      mockClient({ createComment, updateTask, listPeople: vi.fn() }),
      { task_id: '1', comment: 'Done', assignee_id: '42' }
    );

    expect(createComment).toHaveBeenCalledTimes(1);
    expect(updateTask).toHaveBeenCalledTimes(1);
    expect(updateTask.mock.calls[0][1].data.relationships.assignee.data).toEqual({
      id: '42',
      type: 'people',
    });
    expect(result.content[0].text).toContain('Reassigned to: Person ID 42');
  });

  it('resolves "me" from the configured user', async () => {
    const createComment = vi.fn().mockResolvedValue(comment);
    const updateTask = vi.fn().mockResolvedValue({ data: { id: '1', attributes: { title: 'T' } } });

    await addTaskCommentTool(
      mockClient({ createComment, updateTask, listPeople: vi.fn() }),
      { task_id: '1', comment: 'Done', assignee_id: 'me' },
      { PRODUCTIVE_USER_ID: '7000001' }
    );

    expect(updateTask.mock.calls[0][1].data.relationships.assignee.data.id).toBe('7000001');
  });

  it('does not touch the assignment when assignee_id is omitted', async () => {
    const createComment = vi.fn().mockResolvedValue(comment);
    const updateTask = vi.fn();

    await addTaskCommentTool(
      mockClient({ createComment, updateTask, listPeople: vi.fn() }),
      { task_id: '1', comment: 'Done' }
    );

    expect(updateTask).not.toHaveBeenCalled();
  });

  it('keeps the posted comment when the reassignment fails', async () => {
    const createComment = vi.fn().mockResolvedValue(comment);
    const updateTask = vi.fn().mockRejectedValue(new Error('assignment blew up'));

    const result = await addTaskCommentTool(
      mockClient({ createComment, updateTask, listPeople: vi.fn() }),
      { task_id: '1', comment: 'Done', assignee_id: '42' }
    );

    expect(result.content[0].text).toContain('Comment added successfully');
    expect(result.content[0].text).toContain('reassignment FAILED');
  });
});

describe('create_time_entries', () => {
  const entry = (date: string) => ({
    date,
    time: '1h',
    person_id: '7000001',
    service_id: '55',
    note: 'Did the work described here',
  });

  it('describes the whole set and writes nothing without confirm', async () => {
    const createTimeEntry = vi.fn();

    const result = await createTimeEntriesTool(mockClient({ createTimeEntry }), {
      entries: [entry('2026-08-10'), entry('2026-08-11')],
    });

    expect(createTimeEntry).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('2 time entries ready to create, totalling 2h');
  });

  it('uses the singular for one entry', async () => {
    const createTimeEntry = vi.fn();

    const result = await createTimeEntriesTool(mockClient({ createTimeEntry }), {
      entries: [entry('2026-08-10')],
    });

    expect(result.content[0].text).toContain('1 time entry ready to create');
  });

  it('creates every entry from a single call once confirmed', async () => {
    const createTimeEntry = vi
      .fn()
      .mockImplementation(async () => ({ data: { id: 'e', attributes: { time: 60 } } }));

    const result = await createTimeEntriesTool(mockClient({ createTimeEntry }), {
      entries: [entry('2026-08-10'), entry('2026-08-11'), entry('2026-08-12')],
      confirm: true,
    });

    expect(createTimeEntry).toHaveBeenCalledTimes(3);
    expect(result.content[0].text).toContain('Created 3 of 3 time entries');
  });

  it('reports a partial failure per entry instead of losing the successes', async () => {
    const createTimeEntry = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: 'e1', attributes: { time: 60 } } })
      .mockRejectedValueOnce(new Error('time tracking disabled'))
      .mockResolvedValueOnce({ data: { id: 'e3', attributes: { time: 60 } } });

    const result = await createTimeEntriesTool(mockClient({ createTimeEntry }), {
      entries: [entry('2026-08-10'), entry('2026-08-11'), entry('2026-08-12')],
      confirm: true,
    });

    const text = result.content[0].text;
    expect(text).toContain('Created 2 of 3 time entries');
    expect(text).toContain('Failed (not created, safe to retry just these)');
    expect(text).toContain('time tracking disabled');
  });

  it('rejects a bad date before creating anything', async () => {
    const createTimeEntry = vi.fn();

    await expect(
      createTimeEntriesTool(mockClient({ createTimeEntry }), {
        entries: [entry('2026-08-10'), { ...entry('not-a-date'), date: 'not-a-date' }],
        confirm: true,
      })
    ).rejects.toThrow(/Entry 2/);

    expect(createTimeEntry).not.toHaveBeenCalled();
  });
});

describe('get_attachment batching', () => {
  const file = (name: string) => ({
    name,
    contentType: 'application/pdf',
    size: 10,
    data: Buffer.from('pdf'),
  });

  it('downloads several attachments in one call', async () => {
    const downloadAttachment = vi.fn().mockImplementation(async (id: string) => file(`${id}.pdf`));

    const result = await getAttachmentTool(mockClient({ downloadAttachment }), {
      attachment_ids: ['1', '2', '3'],
    });

    expect(downloadAttachment).toHaveBeenCalledTimes(3);
    expect(textOf(result)).toContain('Downloaded 3 of 3 attachments');
  });

  it('keeps the files that downloaded when one id fails', async () => {
    const downloadAttachment = vi
      .fn()
      .mockResolvedValueOnce(file('a.pdf'))
      .mockRejectedValueOnce(new Error('gone'))
      .mockResolvedValueOnce(file('c.pdf'));

    const result = await getAttachmentTool(mockClient({ downloadAttachment }), {
      attachment_ids: ['1', '2', '3'],
    });

    const text = textOf(result);
    expect(text).toContain('Downloaded 2 of 3 attachments');
    expect(text).toContain('2: FAILED');
  });

  it('refuses both arguments at once', async () => {
    await expect(
      getAttachmentTool(mockClient({ downloadAttachment: vi.fn() }), {
        attachment_id: '1',
        attachment_ids: ['2'],
      })
    ).rejects.toThrow(/not both/);
  });
});

describe('service listings flag time tracking', () => {
  const services = (enabled: boolean | undefined) => ({
    data: [{ id: '55', attributes: { name: 'Hyper-support', time_tracking_enabled: enabled } }],
  });

  it('warns when a service cannot accept time entries', async () => {
    const listServices = vi.fn().mockResolvedValue(services(false));

    const text = (await getProjectServicesTool(mockClient({ listServices }), { project_id: '1' }))
      .content[0].text;

    expect(text).toContain('DISABLED, this service cannot accept time entries');
  });

  it('marks the services that do accept time', async () => {
    const listServices = vi.fn().mockResolvedValue(services(true));

    const text = (await getProjectServicesTool(mockClient({ listServices }), { project_id: '1' }))
      .content[0].text;

    expect(text).toContain('Time tracking: enabled');
  });

  it('does not fetch a project list it never uses', async () => {
    const listServices = vi.fn().mockResolvedValue(services(true));
    const listProjects = vi.fn();

    await getProjectServicesTool(mockClient({ listServices, listProjects }), { project_id: '1' });

    expect(listProjects).not.toHaveBeenCalled();
  });

  it('filters the services by project rather than listing every service', async () => {
    const listServices = vi.fn().mockResolvedValue(services(true));

    await getProjectServicesTool(mockClient({ listServices }), { project_id: '400001' });

    expect(listServices.mock.calls[0][0].project_id).toBe('400001');
  });

  it('says nothing when the API did not report the flag', async () => {
    const listServices = vi.fn().mockResolvedValue(services(undefined));

    const text = (await getProjectServicesTool(mockClient({ listServices }), { project_id: '1' }))
      .content[0].text;

    expect(text).not.toContain('Time tracking');
  });
});
