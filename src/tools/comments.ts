import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const addTaskCommentSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  comment: z.string().min(1, 'Comment text is required'),
});

const getTaskCommentsSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  limit: z.number().min(1).max(100).optional(),
  page: z.number().min(1).optional(),
});

export async function addTaskCommentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = addTaskCommentSchema.parse(args);
    
    const commentData = {
      data: {
        type: 'comments' as const,
        attributes: {
          body: params.comment,
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
    
    let text = `Comment added successfully!\n`;
    text += `Task ID: ${params.task_id}\n`;
    text += `Comment: ${response.data.attributes.body}\n`;
    text += `Comment ID: ${response.data.id}`;
    if (response.data.attributes.created_at) {
      text += `\nCreated at: ${response.data.attributes.created_at}`;
    }
    
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
  description: 'Add a comment to a task in Productive.io',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to add the comment to (required)',
      },
      comment: {
        type: 'string',
        description: 'Text content of the comment (required)',
      },
    },
    required: ['task_id', 'comment'],
  },
};

export async function getTaskCommentsTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getTaskCommentsSchema.parse(args);
    
    const response = await client.listComments({
      task_id: params.task_id,
      limit: params.limit,
      page: params.page,
    });
    
    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No comments found for task ${params.task_id}`,
        }],
      };
    }
    
    let text = `Found ${response.data.length} comment(s) for task ${params.task_id}:\n\n`;
    
    response.data.forEach((comment, index) => {
      text += `Comment ${index + 1}:\n`;
      text += `  ID: ${comment.id}\n`;
      text += `  Body: ${comment.attributes.body}\n`;
      text += `  Created: ${comment.attributes.created_at}\n`;
      
      if (comment.attributes.edited_at) {
        text += `  Edited: ${comment.attributes.edited_at}\n`;
      }
      
      if (comment.attributes.pinned_at) {
        text += `  📌 Pinned: ${comment.attributes.pinned_at}\n`;
      }
      
      if (comment.relationships?.creator?.data) {
        text += `  Author ID: ${comment.relationships.creator.data.id}\n`;
      }
      
      text += '\n';
    });
    
    if (response.meta) {
      text += `\nPagination: Page ${response.meta.current_page || 1} of ${response.meta.total_pages || 1}`;
      text += ` (Total: ${response.meta.total_count || response.data.length} comments)`;
    }
    
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

export const getTaskCommentsDefinition = {
  name: 'get_task_comments',
  description: 'Get all comments for a task in Productive.io. Returns comments with their content, creation date, author, and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to get comments from (required)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of comments to return per page (1-100, default: 25)',
        minimum: 1,
        maximum: 100,
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default: 1)',
        minimum: 1,
      },
    },
    required: ['task_id'],
  },
};