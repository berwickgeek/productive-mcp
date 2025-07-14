import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveTaskUpdate } from '../api/types.js';

const updateTaskStatusSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  status: z.union([
    z.enum(['open', 'closed']),
    z.number().int().min(1),
  ]).describe('Task status: "open" (1), "closed" (2), or a custom status number'),
});

export async function updateTaskStatusTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updateTaskStatusSchema.parse(args);
    
    // Convert status to number if it's a string
    let statusValue: number;
    if (typeof params.status === 'string') {
      statusValue = params.status === 'open' ? 1 : 2;
    } else {
      statusValue = params.status;
    }
    
    const taskUpdate: ProductiveTaskUpdate = {
      data: {
        type: 'tasks',
        id: params.task_id,
        attributes: {
          status: statusValue,
        },
      },
    };
    
    const response = await client.updateTask(params.task_id, taskUpdate);
    
    let text = `Task status updated successfully!\n`;
    text += `Task: ${response.data.attributes.title} (ID: ${response.data.id})\n`;
    
    // Check both possible status fields in the response
    let actualStatus: string;
    if (response.data.attributes.closed !== undefined) {
      // Single task response format uses 'closed' boolean
      actualStatus = response.data.attributes.closed ? 'closed' : 'open';
    } else if (response.data.attributes.status !== undefined) {
      // List response format uses 'status' integer
      actualStatus = response.data.attributes.status === 1 ? 'open' : 
                    response.data.attributes.status === 2 ? 'closed' : 
                    `status ${response.data.attributes.status}`;
    } else {
      // Fallback to what we sent
      actualStatus = statusValue === 1 ? 'open' : statusValue === 2 ? 'closed' : `status ${statusValue}`;
    }
    
    text += `New status: ${actualStatus}`;
    
    if (response.data.attributes.updated_at) {
      text += `\nUpdated at: ${response.data.attributes.updated_at}`;
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

export const updateTaskStatusDefinition = {
  name: 'update_task_status',
  description: 'Update the status of a task in Productive.io. Use "open" (1) or "closed" (2) for standard statuses, or provide a custom status number.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to update (required)',
      },
      status: {
        oneOf: [
          {
            type: 'string',
            enum: ['open', 'closed'],
            description: 'Standard status: "open" or "closed"',
          },
          {
            type: 'number',
            description: 'Custom status number (1=open, 2=closed, or custom workflow status)',
            minimum: 1,
          },
        ],
        description: 'Task status to set',
      },
    },
    required: ['task_id', 'status'],
  },
};