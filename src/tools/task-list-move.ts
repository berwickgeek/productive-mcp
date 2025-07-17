import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const moveTaskToListSchema = z.object({
  task_id: z.string().describe('ID of the task to move'),
  task_list_id: z.string().describe('ID of the task list to move the task to')
});

export async function moveTaskToList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const { task_id, task_list_id } = moveTaskToListSchema.parse(args);
    
    // Update the task's task_list relationship
    const response = await client.updateTask(task_id, {
      data: {
        type: 'tasks',
        id: task_id,
        relationships: {
          task_list: {
            data: {
              type: 'task_lists',
              id: task_list_id
            }
          }
        }
      }
    });
    
    return {
      content: [{
        type: 'text',
        text: `✅ Moved task ${task_id} to task list ${task_list_id}`
      }]
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }
    throw error;
  }
}

export const moveTaskToListTool = {
  name: 'move_task_to_list',
  description: 'Move a task to a different task list within the same project',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to move'
      },
      task_list_id: {
        type: 'string',
        description: 'ID of the task list to move the task to'
      }
    },
    required: ['task_id', 'task_list_id']
  }
};