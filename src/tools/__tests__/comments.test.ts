import { describe, it, expect, vi } from 'vitest';
import { addTaskCommentTool, listCommentsTool } from '../comments.js';
import { ProductiveAPIClient } from '../../api/client.js';
import { ProductiveComment, ProductiveCommentCreate } from '../../api/types.js';

/**
 * Builds a mock comments API response echoing the submitted body and hidden flag.
 */
function makeCommentResponse(body: string, hidden?: boolean): { data: ProductiveComment } {
  return {
    data: {
      id: '999',
      type: 'comments',
      attributes: {
        body,
        commentable_type: 'task',
        created_at: '2026-05-28T10:00:00Z',
        updated_at: '2026-05-28T10:00:00Z',
        ...(hidden !== undefined ? { hidden } : {}),
      },
    },
  };
}

/**
 * Mock client capturing the createComment payload and returning an echo response.
 * listPeople is stubbed so mention resolution never hits the network.
 */
function mockClient(): { client: ProductiveAPIClient; createComment: ReturnType<typeof vi.fn> } {
  const createComment = vi.fn((data: ProductiveCommentCreate) =>
    Promise.resolve(makeCommentResponse(data.data.attributes.body, data.data.attributes.hidden))
  );
  const client = {
    createComment,
    listPeople: vi.fn().mockResolvedValue({ data: [] }),
  } as unknown as ProductiveAPIClient;
  return { client, createComment };
}

describe('addTaskCommentTool - hidden parameter', () => {
  it('sends hidden:true when hidden is set to true', async () => {
    const { client, createComment } = mockClient();

    const result = await addTaskCommentTool(client, {
      task_id: '123',
      comment: 'Internal note',
      hidden: true,
    });

    expect(createComment).toHaveBeenCalledTimes(1);
    const payload = createComment.mock.calls[0][0] as ProductiveCommentCreate;
    expect(payload.data.attributes.hidden).toBe(true);
    expect(result.content[0].text).toContain('Hidden comment added successfully');
    expect(result.content[0].text).toContain('Hidden: true');
  });

  it('sends hidden:false when hidden is set to false', async () => {
    const { client, createComment } = mockClient();

    const result = await addTaskCommentTool(client, {
      task_id: '123',
      comment: 'Visible note',
      hidden: false,
    });

    const payload = createComment.mock.calls[0][0] as ProductiveCommentCreate;
    expect(payload.data.attributes.hidden).toBe(false);
    expect(result.content[0].text).toContain('Comment added successfully');
    expect(result.content[0].text).not.toContain('Hidden comment added successfully');
  });

  it('omits the hidden attribute entirely when not provided', async () => {
    const { client, createComment } = mockClient();

    await addTaskCommentTool(client, {
      task_id: '123',
      comment: 'Default note',
    });

    const payload = createComment.mock.calls[0][0] as ProductiveCommentCreate;
    expect('hidden' in payload.data.attributes).toBe(false);
  });

  it('attaches the comment to the correct task', async () => {
    const { client, createComment } = mockClient();

    await addTaskCommentTool(client, {
      task_id: '456',
      comment: 'Note',
      hidden: true,
    });

    const payload = createComment.mock.calls[0][0] as ProductiveCommentCreate;
    expect(payload.data.relationships.task.data.id).toBe('456');
    expect(payload.data.relationships.task.data.type).toBe('tasks');
  });

  it('rejects a non-boolean hidden value', async () => {
    const { client } = mockClient();

    await expect(
      addTaskCommentTool(client, {
        task_id: '123',
        comment: 'Note',
        hidden: 'yes',
      })
    ).rejects.toThrow(/Invalid parameters/);
  });
});

/**
 * Builds a comment resource for list responses, allowing a null body
 * (the API returns null for attachment-only or system-generated comments).
 */
function makeListedComment(id: string, body: string | null): ProductiveComment {
  return {
    id,
    type: 'comments',
    attributes: {
      body,
      commentable_type: 'task',
      created_at: '2026-06-10T10:00:00Z',
      updated_at: '2026-06-10T10:00:00Z',
    },
  };
}

describe('listCommentsTool - null comment bodies', () => {
  it('renders comments with a null body as (no content) instead of throwing', async () => {
    const listComments = vi.fn().mockResolvedValue({
      data: [makeListedComment('1', 'A real comment'), makeListedComment('2', null)],
    });
    const client = { listComments } as unknown as ProductiveAPIClient;

    const result = await listCommentsTool(client, { task_id: '18263163' });

    const text = result.content[0].text;
    expect(text).toContain('Comments (2)');
    expect(text).toContain('A real comment');
    expect(text).toContain('(no content)');
  });
});
