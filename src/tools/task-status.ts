import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveTaskUpdate } from '../api/types.js';

const updateTaskStatusSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  workflow_status_id: z.string().min(1, 'Workflow status ID is required'),
});

export async function updateTaskStatusTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updateTaskStatusSchema.parse(args);
    
    const taskUpdate: ProductiveTaskUpdate = {
      data: {
        type: 'tasks',
        id: params.task_id,
        relationships: {
          workflow_status: {
            data: {
              id: params.workflow_status_id,
              type: 'workflow_statuses',
            },
          },
        },
      },
    };
    
    const response = await client.updateTask(params.task_id, taskUpdate);
    
    let text = `Task status updated successfully!\n`;
    text += `Task: ${response.data.attributes.title} (ID: ${response.data.id})\n`;
    text += `Workflow Status ID: ${params.workflow_status_id}`;
    
    // Check for status information in the response
    if (response.data.attributes.closed !== undefined) {
      const statusText = response.data.attributes.closed ? 'closed' : 'open';
      text += `\nActual Status: ${statusText}`;
    }
    
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
  description: 'Update the status of a task in Productive.io using workflow status ID. Use list_workflow_statuses to see available status IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to update (required)',
      },
      workflow_status_id: {
        type: 'string',
        description: 'ID of the workflow status to set (use list_workflow_statuses to see available options)',
      },
    },
    required: ['task_id', 'workflow_status_id'],
  },
};