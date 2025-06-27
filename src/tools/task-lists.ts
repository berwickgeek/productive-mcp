import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const ListTaskListsSchema = z.object({
  board_id: z.string().optional().describe('Filter task lists by board ID'),
  limit: z.number().optional().default(30).describe('Number of task lists to return (max 200)'),
});

export async function listTaskLists(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = ListTaskListsSchema.parse(args);
    
    const response = await client.listTaskLists({
      board_id: params.board_id,
      limit: params.limit,
    });
    
    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No task lists found',
        }],
      };
    }
    
    const taskListsText = response.data.map(taskList => {
      let text = `Task List: ${taskList.attributes.name} (ID: ${taskList.id})`;
      if (taskList.attributes.description) {
        text += `\nDescription: ${taskList.attributes.description}`;
      }
      if (taskList.attributes.position !== undefined) {
        text += `\nPosition: ${taskList.attributes.position}`;
      }
      if (taskList.relationships?.board?.data?.id) {
        text += `\nBoard ID: ${taskList.relationships.board.data.id}`;
      }
      return text;
    }).join('\n\n');
    
    return {
      content: [{
        type: 'text',
        text: taskListsText,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    
    if (error instanceof Error) {
      throw new McpError(
        ErrorCode.InternalError,
        `API error: ${error.message}`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      'Unknown error occurred while fetching task lists'
    );
  }
}

export const listTaskListsTool = {
  name: 'list_task_lists',
  description: 'Get a list of task lists from Productive.io. Task lists organize tasks within boards.',
  inputSchema: {
    type: 'object',
    properties: {
      board_id: {
        type: 'string',
        description: 'Filter task lists by board ID',
      },
      limit: {
        type: 'number',
        description: 'Number of task lists to return (max 200)',
        default: 30,
      },
    },
  },
};

const CreateTaskListSchema = z.object({
  board_id: z.string().describe('The ID of the board to create the task list in'),
  project_id: z.string().describe('The ID of the project'),
  name: z.string().describe('Name of the task list'),
  description: z.string().optional().describe('Description of the task list'),
});

export async function createTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = CreateTaskListSchema.parse(args);
    
    const taskListData = {
      data: {
        type: 'task_lists' as const,
        attributes: {
          name: params.name,
          ...(params.description && { description: params.description }),
          position: 0,
          project_id: params.project_id,
        },
        relationships: {
          board: {
            data: {
              id: params.board_id,
              type: 'boards' as const,
            },
          },
        },
      },
    };
    
    // Debug: Log the request data
    console.error('Creating task list with data:', JSON.stringify(taskListData, null, 2));
    
    const response = await client.createTaskList(taskListData);
    
    let text = `Task list created successfully!\n`;
    text += `Name: ${response.data.attributes.name} (ID: ${response.data.id})`;
    if (response.data.attributes.description) {
      text += `\nDescription: ${response.data.attributes.description}`;
    }
    text += `\nBoard ID: ${params.board_id}`;
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
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    
    if (error instanceof Error) {
      throw new McpError(
        ErrorCode.InternalError,
        `API error: ${error.message}`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      'Unknown error occurred while creating task list'
    );
  }
}

export const createTaskListTool = {
  name: 'create_task_list',
  description: 'Create a new task list in a Productive.io board. Task lists help organize tasks within boards.',
  inputSchema: {
    type: 'object',
    properties: {
      board_id: {
        type: 'string',
        description: 'The ID of the board to create the task list in',
      },
      project_id: {
        type: 'string',
        description: 'The ID of the project',
      },
      name: {
        type: 'string',
        description: 'Name of the task list',
      },
      description: {
        type: 'string',
        description: 'Description of the task list',
      },
    },
    required: ['board_id', 'project_id', 'name'],
  },
};