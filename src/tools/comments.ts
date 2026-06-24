import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveIncludedResource } from '../api/types.js';
import { resolveMentions, MentionResolutionResult } from '../utils/mentions.js';
import { formatAttachments } from '../utils/attachments.js';

type ToolResult = { content: Array<{ type: string; text: string }> };

function resolvePersonName(personId: string | undefined, included?: ProductiveIncludedResource[]): string | undefined {
  if (!personId || !included) return undefined;
  const person = included.find(item => item.type === 'people' && item.id === personId);
  if (!person) return undefined;
  const first = person.attributes.first_name || '';
  const last = person.attributes.last_name || '';
  return `${first} ${last}`.trim() || undefined;
}

function truncateBody(body: string | null | undefined, maxLength = 200): string {
  if (!body) return '(no content)';
  if (body.length <= maxLength) return body;
  return body.substring(0, maxLength) + '...';
}

function formatMentionFeedback(result: MentionResolutionResult): string {
  let feedback = '';
  if (result.resolved.length > 0) {
    feedback += `\nMentions resolved: ${result.resolved.map(r => r.token.raw).join(', ')}`;
  }
  if (result.unresolved.length > 0) {
    feedback += `\nWarning - unresolved mentions (left as plain text): ${result.unresolved.map(u => u.raw).join(', ')}`;
  }
  return feedback;
}

function buildAmbiguousError(result: MentionResolutionResult): string {
  return result.ambiguous.map(a =>
    `"${a.token.raw}" matches multiple people: ${a.candidates.map(c =>
      `${c.attributes.first_name} ${c.attributes.last_name} (ID: ${c.id})`
    ).join(', ')}`
  ).join('\n');
}

// ---- Add Task Comment ----

const addTaskCommentSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  comment: z.string().min(1, 'Comment text is required'),
  hidden: z.boolean().optional(),
});

export async function addTaskCommentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<ToolResult> {
  try {
    const params = addTaskCommentSchema.parse(args);

    // Resolve @mentions in comment body
    const mentionResult = await resolveMentions(params.comment, client);

    if (mentionResult.ambiguous.length > 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Ambiguous mentions found:\n${buildAmbiguousError(mentionResult)}\nPlease use full names to disambiguate.`
      );
    }

    const commentData = {
      data: {
        type: 'comments' as const,
        attributes: {
          body: mentionResult.resolvedBody,
          ...(params.hidden !== undefined ? { hidden: params.hidden } : {}),
        },
        relationships: {
          task: {
            data: {
              id: params.task_id,
              type: 'tasks' as const,
            },
          },
        },
      },
    };

    const response = await client.createComment(commentData);

    let text = params.hidden ? `Hidden comment added successfully!\n` : `Comment added successfully!\n`;
    text += `Task ID: ${params.task_id}\n`;
    text += `Comment: ${response.data.attributes.body}\n`;
    text += `Comment ID: ${response.data.id}`;
    if (response.data.attributes.hidden !== undefined) {
      text += `\nHidden: ${response.data.attributes.hidden}`;
    }
    if (response.data.attributes.created_at) {
      text += `\nCreated at: ${response.data.attributes.created_at}`;
    }
    text += formatMentionFeedback(mentionResult);

    return {
      content: [{
        type: 'text',
        text: text,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const addTaskCommentDefinition = {
  name: 'add_task_comment',
  description: 'Add a comment to a task in Productive.io. Supports HTML formatting and @mentions (e.g. @Jarrod Lawson). Mentions are automatically resolved to notify the mentioned person. Set hidden to true to post an internal comment that is not visible to clients in the client portal (hidden comments are not available in internal projects).',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to add the comment to (required)',
      },
      comment: {
        type: 'string',
        description: 'Comment content (required). Supports HTML formatting and @mentions (e.g. @Jarrod Lawson). Tags: <div>, <p>, <strong>, <em>, <ul>, <li>, <a href="">.',
      },
      hidden: {
        type: 'boolean',
        description: 'When true, posts a hidden (internal) comment that is not visible to clients in the client portal. Defaults to false. Note: hidden comments are not available in internal projects.',
      },
    },
    required: ['task_id', 'comment'],
  },
};

// ---- List Comments ----

const listCommentsSchema = z.object({
  task_id: z.string().optional(),
  project_id: z.string().optional(),
  limit: z.number().optional(),
});

export async function listCommentsTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<ToolResult> {
  try {
    const params = listCommentsSchema.parse(args);

    const response = await client.listComments({
      task_id: params.task_id,
      project_id: params.project_id,
      limit: params.limit,
    });

    if (!response.data || response.data.length === 0) {
      return {
        content: [{ type: 'text', text: 'No comments found.' }],
      };
    }

    const commentsText = response.data.map(comment => {
      const creatorId = comment.relationships?.creator?.data?.id;
      const creatorName = resolvePersonName(creatorId, response.included) || `Person ${creatorId || 'unknown'}`;
      const pinned = comment.attributes.pinned_at ? ' [PINNED]' : '';
      const body = truncateBody(comment.attributes.body);
      const attachments = formatAttachments(comment.relationships, response.included, '  ');

      return `- Comment ID: ${comment.id}${pinned}\n  By: ${creatorName}\n  Date: ${comment.attributes.created_at}\n  Body: ${body}${attachments}`;
    }).join('\n\n');

    return {
      content: [{ type: 'text', text: `Comments (${response.data.length}):\n\n${commentsText}` }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const listCommentsDefinition = {
  name: 'list_comments',
  description: 'List comments in Productive.io, optionally filtered by task or project.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'Filter comments by task ID',
      },
      project_id: {
        type: 'string',
        description: 'Filter comments by project ID',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of comments to return',
      },
    },
  },
};

// ---- Get Comment ----

const getCommentSchema = z.object({
  comment_id: z.string().min(1, 'Comment ID is required'),
});

export async function getCommentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<ToolResult> {
  try {
    const params = getCommentSchema.parse(args);

    const response = await client.getComment(params.comment_id);
    const comment = response.data;
    const attrs = comment.attributes;

    const creatorId = comment.relationships?.creator?.data?.id;
    const included = (response as unknown as { included?: ProductiveIncludedResource[] }).included;
    const creatorName = resolvePersonName(creatorId, included) || `Person ${creatorId || 'unknown'}`;

    let text = `Comment ID: ${comment.id}\n`;
    text += `Body: ${attrs.body ?? '(no content)'}\n`;
    text += `Commentable Type: ${attrs.commentable_type}\n`;
    text += `Creator: ${creatorName}\n`;
    text += `Created: ${attrs.created_at}\n`;
    text += `Updated: ${attrs.updated_at}\n`;
    if (attrs.edited_at) text += `Edited: ${attrs.edited_at}\n`;
    if (attrs.deleted_at) text += `Deleted: ${attrs.deleted_at}\n`;
    text += `Draft: ${attrs.draft ?? false}\n`;
    text += `Hidden: ${attrs.hidden ?? false}\n`;
    text += `Pinned: ${attrs.pinned_at ? `Yes (${attrs.pinned_at})` : 'No'}\n`;
    if (attrs.reactions) text += `Reactions: ${JSON.stringify(attrs.reactions)}\n`;
    if (attrs.version_number !== undefined) text += `Version: ${attrs.version_number}\n`;
    text += formatAttachments(comment.relationships, included, '');

    return {
      content: [{ type: 'text', text }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const getCommentDefinition = {
  name: 'get_comment',
  description: 'Get a single comment by ID from Productive.io with all attributes.',
  inputSchema: {
    type: 'object',
    properties: {
      comment_id: {
        type: 'string',
        description: 'The ID of the comment to retrieve (required)',
      },
    },
    required: ['comment_id'],
  },
};

// ---- Update Comment ----

const updateCommentSchema = z.object({
  comment_id: z.string().min(1, 'Comment ID is required'),
  body: z.string().min(1, 'Comment body is required'),
});

export async function updateCommentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<ToolResult> {
  try {
    const params = updateCommentSchema.parse(args);

    // Resolve @mentions in comment body
    const mentionResult = await resolveMentions(params.body, client);

    if (mentionResult.ambiguous.length > 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Ambiguous mentions found:\n${buildAmbiguousError(mentionResult)}\nPlease use full names to disambiguate.`
      );
    }

    const response = await client.updateComment(params.comment_id, {
      data: {
        type: 'comments',
        id: params.comment_id,
        attributes: {
          body: mentionResult.resolvedBody,
        },
      },
    });

    let text = `Comment ${params.comment_id} updated successfully.\nNew body: ${response.data.attributes.body}`;
    text += formatMentionFeedback(mentionResult);

    return {
      content: [{
        type: 'text',
        text,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const updateCommentDefinition = {
  name: 'update_comment',
  description: 'Update the body of an existing comment in Productive.io. Supports @mentions (e.g. @Jarrod Lawson) which are automatically resolved.',
  inputSchema: {
    type: 'object',
    properties: {
      comment_id: {
        type: 'string',
        description: 'The ID of the comment to update (required)',
      },
      body: {
        type: 'string',
        description: 'The new comment body content (required). Supports HTML formatting and @mentions (e.g. @Jarrod Lawson).',
      },
    },
    required: ['comment_id', 'body'],
  },
};

// ---- Delete Comment ----

const deleteCommentSchema = z.object({
  comment_id: z.string().min(1, 'Comment ID is required'),
});

export async function deleteCommentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<ToolResult> {
  try {
    const params = deleteCommentSchema.parse(args);

    await client.deleteComment(params.comment_id);

    return {
      content: [{
        type: 'text',
        text: `Comment ${params.comment_id} deleted successfully.`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const deleteCommentDefinition = {
  name: 'delete_comment',
  description: 'Delete a comment by ID from Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      comment_id: {
        type: 'string',
        description: 'The ID of the comment to delete (required)',
      },
    },
    required: ['comment_id'],
  },
};

// ---- Pin Comment ----

const pinCommentSchema = z.object({
  comment_id: z.string().min(1, 'Comment ID is required'),
});

export async function pinCommentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<ToolResult> {
  try {
    const params = pinCommentSchema.parse(args);

    await client.pinComment(params.comment_id);

    return {
      content: [{
        type: 'text',
        text: `Comment ${params.comment_id} pinned successfully.`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const pinCommentDefinition = {
  name: 'pin_comment',
  description: 'Pin a comment in Productive.io so it appears prominently.',
  inputSchema: {
    type: 'object',
    properties: {
      comment_id: {
        type: 'string',
        description: 'The ID of the comment to pin (required)',
      },
    },
    required: ['comment_id'],
  },
};

// ---- Unpin Comment ----

const unpinCommentSchema = z.object({
  comment_id: z.string().min(1, 'Comment ID is required'),
});

export async function unpinCommentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<ToolResult> {
  try {
    const params = unpinCommentSchema.parse(args);

    await client.unpinComment(params.comment_id);

    return {
      content: [{
        type: 'text',
        text: `Comment ${params.comment_id} unpinned successfully.`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const unpinCommentDefinition = {
  name: 'unpin_comment',
  description: 'Unpin a previously pinned comment in Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      comment_id: {
        type: 'string',
        description: 'The ID of the comment to unpin (required)',
      },
    },
    required: ['comment_id'],
  },
};

// ---- Add Comment Reaction ----

const addCommentReactionSchema = z.object({
  comment_id: z.string().min(1, 'Comment ID is required'),
  reaction: z.string().min(1, 'Reaction is required'),
});

export async function addCommentReactionTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<ToolResult> {
  try {
    const params = addCommentReactionSchema.parse(args);

    await client.addCommentReaction(params.comment_id, params.reaction);

    return {
      content: [{
        type: 'text',
        text: `Reaction "${params.reaction}" added to comment ${params.comment_id} successfully.`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const addCommentReactionDefinition = {
  name: 'add_comment_reaction',
  description: 'Add a reaction (e.g. "like") to a comment in Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      comment_id: {
        type: 'string',
        description: 'The ID of the comment to react to (required)',
      },
      reaction: {
        type: 'string',
        description: 'The reaction to add (e.g. "like", "heart", "thumbsup") (required)',
      },
    },
    required: ['comment_id', 'reaction'],
  },
};