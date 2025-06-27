import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { Config } from '../config/index.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const myTasksSchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

export async function myTasksTool(
  client: ProductiveAPIClient,
  config: Config,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    // Check if user ID is configured
    if (!config.PRODUCTIVE_USER_ID) {
      return {
        content: [{
          type: 'text',
          text: 'User ID not configured. Please set PRODUCTIVE_USER_ID in your environment variables to use this feature.',
        }],
      };
    }
    
    const params = myTasksSchema.parse(args);
    
    const response = await client.listTasks({
      assignee_id: config.PRODUCTIVE_USER_ID,
      status: params.status,
      limit: params.limit,
    });
    
    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'You have no tasks assigned to you.',
        }],
      };
    }
    
    const tasksText = response.data.map(task => {
      const projectId = task.relationships?.project?.data?.id;
      const statusIcon = task.attributes.status === 2 ? '✓' : '○';
      const statusText = task.attributes.status === 1 ? 'open' : task.attributes.status === 2 ? 'closed' : `status ${task.attributes.status}`;
      
      return `${statusIcon} ${task.attributes.title} (ID: ${task.id})
  Status: ${statusText}
  ${task.attributes.due_date ? `Due: ${task.attributes.due_date}` : 'No due date'}
  ${projectId ? `Project ID: ${projectId}` : ''}
  ${task.attributes.description ? `Description: ${task.attributes.description}` : ''}`;
    }).join('\n\n');
    
    const summary = `You have ${response.data.length} task${response.data.length !== 1 ? 's' : ''} assigned to you${response.meta?.total_count ? ` (showing ${response.data.length} of ${response.meta.total_count})` : ''}:\n\n${tasksText}`;
    
    return {
      content: [{
        type: 'text',
        text: summary,
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

export const myTasksDefinition = {
  name: 'my_tasks',
  description: 'Get tasks assigned to you (requires PRODUCTIVE_USER_ID to be configured)',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['open', 'closed'],
        description: 'Filter by task status (open or closed)',
      },
      limit: {
        type: 'number',
        description: 'Number of tasks to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
  },
};