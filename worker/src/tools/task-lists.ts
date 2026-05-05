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
    const params = ListTaskListsSchema.parse(args || {});
    
    const response = await client.listTaskLists({
      board_id: params.board_id,
      limit: params.limit,
    });
    
    if (!response || !response.data || response.data.length === 0) {
      const filterText = params.board_id ? ` for board ${params.board_id}` : '';
      return {
        content: [{
          type: 'text',
          text: `No task lists found${filterText}`,
        }],
      };
    }
    
    const taskListsText = response.data.filter(taskList => taskList && taskList.attributes).map(taskList => {
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
        `Invalid parameters: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
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
        `Invalid parameters: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
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

// --- Get Task List ---

const GetTaskListSchema = z.object({
  task_list_id: z.string().describe('The ID of the task list to retrieve'),
});

export async function getTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = GetTaskListSchema.parse(args);

    const response = await client.getTaskList(params.task_list_id);

    const taskList = response.data;
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
    if (taskList.attributes.created_at) {
      text += `\nCreated at: ${taskList.attributes.created_at}`;
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
        `Invalid parameters: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
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
      'Unknown error occurred while fetching task list'
    );
  }
}

export const getTaskListTool = {
  name: 'get_task_list',
  description: 'Get a single task list by ID from Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      task_list_id: {
        type: 'string',
        description: 'The ID of the task list to retrieve',
      },
    },
    required: ['task_list_id'],
  },
};

export const getTaskListDefinition = getTaskListTool;

// --- Update Task List ---

const UpdateTaskListSchema = z.object({
  task_list_id: z.string().describe('The ID of the task list to update'),
  name: z.string().optional().describe('New name for the task list'),
});

export async function updateTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = UpdateTaskListSchema.parse(args);

    const updateData = {
      data: {
        type: 'task_lists' as const,
        id: params.task_list_id,
        attributes: {
          ...(params.name && { name: params.name }),
        },
      },
    };

    const response = await client.updateTaskList(params.task_list_id, updateData);

    const taskList = response.data;
    let text = `Task list updated successfully!\n`;
    text += `Name: ${taskList.attributes.name} (ID: ${taskList.id})`;
    if (taskList.attributes.description) {
      text += `\nDescription: ${taskList.attributes.description}`;
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
        `Invalid parameters: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
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
      'Unknown error occurred while updating task list'
    );
  }
}

export const updateTaskListTool = {
  name: 'update_task_list',
  description: 'Update an existing task list in Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      task_list_id: {
        type: 'string',
        description: 'The ID of the task list to update',
      },
      name: {
        type: 'string',
        description: 'New name for the task list',
      },
    },
    required: ['task_list_id'],
  },
};

export const updateTaskListDefinition = updateTaskListTool;

// --- Archive Task List ---

const ArchiveTaskListSchema = z.object({
  task_list_id: z.string().describe('The ID of the task list to archive'),
});

export async function archiveTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = ArchiveTaskListSchema.parse(args);

    await client.archiveTaskList(params.task_list_id);

    return {
      content: [{
        type: 'text',
        text: `Task list ${params.task_list_id} archived successfully.`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
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
      'Unknown error occurred while archiving task list'
    );
  }
}

export const archiveTaskListTool = {
  name: 'archive_task_list',
  description: 'Archive a task list in Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      task_list_id: {
        type: 'string',
        description: 'The ID of the task list to archive',
      },
    },
    required: ['task_list_id'],
  },
};

export const archiveTaskListDefinition = archiveTaskListTool;

// --- Restore Task List ---

const RestoreTaskListSchema = z.object({
  task_list_id: z.string().describe('The ID of the task list to restore'),
});

export async function restoreTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = RestoreTaskListSchema.parse(args);

    await client.restoreTaskList(params.task_list_id);

    return {
      content: [{
        type: 'text',
        text: `Task list ${params.task_list_id} restored successfully.`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
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
      'Unknown error occurred while restoring task list'
    );
  }
}

export const restoreTaskListTool = {
  name: 'restore_task_list',
  description: 'Restore a previously archived task list in Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      task_list_id: {
        type: 'string',
        description: 'The ID of the task list to restore',
      },
    },
    required: ['task_list_id'],
  },
};

export const restoreTaskListDefinition = restoreTaskListTool;

// --- Copy Task List ---

const CopyTaskListSchema = z.object({
  name: z.string().describe('Name for the copied task list'),
  template_id: z.string().describe('The ID of the source task list to copy from'),
  project_id: z.string().describe('The ID of the project for the new task list'),
  board_id: z.string().describe('The ID of the board for the new task list'),
  copy_open_tasks: z.boolean().optional().describe('Whether to copy open tasks from the template'),
  copy_assignees: z.boolean().optional().describe('Whether to copy assignees from the template'),
});

export async function copyTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = CopyTaskListSchema.parse(args);

    const response = await client.copyTaskList({
      name: params.name,
      template_id: params.template_id,
      project_id: params.project_id,
      board_id: params.board_id,
      ...(params.copy_open_tasks !== undefined && { copy_open_tasks: params.copy_open_tasks }),
      ...(params.copy_assignees !== undefined && { copy_assignees: params.copy_assignees }),
    });

    const taskList = response.data;
    let text = `Task list copied successfully!\n`;
    text += `Name: ${taskList.attributes.name} (ID: ${taskList.id})`;
    if (taskList.attributes.description) {
      text += `\nDescription: ${taskList.attributes.description}`;
    }
    text += `\nBoard ID: ${params.board_id}`;

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
        `Invalid parameters: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
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
      'Unknown error occurred while copying task list'
    );
  }
}

export const copyTaskListTool = {
  name: 'copy_task_list',
  description: 'Copy a task list from a template in Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name for the copied task list',
      },
      template_id: {
        type: 'string',
        description: 'The ID of the source task list to copy from',
      },
      project_id: {
        type: 'string',
        description: 'The ID of the project for the new task list',
      },
      board_id: {
        type: 'string',
        description: 'The ID of the board for the new task list',
      },
      copy_open_tasks: {
        type: 'boolean',
        description: 'Whether to copy open tasks from the template',
      },
      copy_assignees: {
        type: 'boolean',
        description: 'Whether to copy assignees from the template',
      },
    },
    required: ['name', 'template_id', 'project_id', 'board_id'],
  },
};

export const copyTaskListDefinition = copyTaskListTool;

// --- Move Task List ---

const MoveTaskListSchema = z.object({
  task_list_id: z.string().describe('The ID of the task list to move'),
  board_id: z.string().describe('The ID of the destination board'),
});

export async function moveTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = MoveTaskListSchema.parse(args);

    await client.moveTaskList(params.task_list_id, params.board_id);

    return {
      content: [{
        type: 'text',
        text: `Task list ${params.task_list_id} moved to board ${params.board_id} successfully.`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
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
      'Unknown error occurred while moving task list'
    );
  }
}

export const moveTaskListTool = {
  name: 'move_task_list',
  description: 'Move a task list to a different board in Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      task_list_id: {
        type: 'string',
        description: 'The ID of the task list to move',
      },
      board_id: {
        type: 'string',
        description: 'The ID of the destination board',
      },
    },
    required: ['task_list_id', 'board_id'],
  },
};

export const moveTaskListDefinition = moveTaskListTool;

// --- Reposition Task List ---

const RepositionTaskListSchema = z.object({
  task_list_id: z.string().describe('The ID of the task list to reposition'),
  move_before_id: z.string().describe('The ID of the task list to move before'),
});

export async function repositionTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = RepositionTaskListSchema.parse(args);

    await client.repositionTaskList(params.task_list_id, params.move_before_id);

    return {
      content: [{
        type: 'text',
        text: `Task list ${params.task_list_id} repositioned before ${params.move_before_id} successfully.`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
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
      'Unknown error occurred while repositioning task list'
    );
  }
}

export const repositionTaskListTool = {
  name: 'reposition_task_list',
  description: 'Reposition a task list before another task list in Productive.io.',
  inputSchema: {
    type: 'object',
    properties: {
      task_list_id: {
        type: 'string',
        description: 'The ID of the task list to reposition',
      },
      move_before_id: {
        type: 'string',
        description: 'The ID of the task list to move before',
      },
    },
    required: ['task_list_id', 'move_before_id'],
  },
};

export const repositionTaskListDefinition = repositionTaskListTool;
