import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveIncludedResource } from '../api/types.js';

function resolveTaskTitle(taskId: string | undefined, included?: ProductiveIncludedResource[]): string | undefined {
  if (!taskId || !included) return undefined;
  const task = included.find(item => item.type === 'tasks' && item.id === taskId);
  return task?.attributes?.title as string | undefined;
}

function dependencyTypeLabel(typeId: number): string {
  switch (typeId) {
    case 1: return 'blocks (finish to start)';
    case 2: return 'is blocked by';
    case 3: return 'related to';
    default: return `type ${typeId}`;
  }
}

// ---- Schemas ----

const listTaskDependenciesSchema = z.object({
  task_id: z.string().optional().describe('Filter by source task ID (the blocker)'),
  dependent_task_id: z.string().optional().describe('Filter by dependent task ID (the blocked task)'),
  limit: z.number().min(1).max(200).default(50).optional(),
});

const getTaskDependencySchema = z.object({
  dependency_id: z.string().min(1, 'Dependency ID is required'),
});

const createTaskDependencySchema = z.object({
  task_id: z.string().min(1, 'Task ID is required (the blocker)'),
  dependent_task_id: z.string().min(1, 'Dependent task ID is required (the blocked task)'),
  type_id: z.number().min(1).max(3).default(1).describe('1 = blocks (finish to start), 2 = is blocked by, 3 = related to'),
});

const deleteTaskDependencySchema = z.object({
  dependency_id: z.string().min(1, 'Dependency ID is required'),
});

// ---- Handlers ----

export async function listTaskDependenciesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listTaskDependenciesSchema.parse(args || {});

    const response = await client.listTaskDependencies({
      task_id: params.task_id,
      dependent_task_id: params.dependent_task_id,
      limit: params.limit,
    });

    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No task dependencies found.',
        }],
      };
    }

    const depsText = response.data.map(dep => {
      const taskId = dep.relationships?.task?.data?.id;
      const depTaskId = dep.relationships?.dependent_task?.data?.id;
      const taskTitle = resolveTaskTitle(taskId, response.included);
      const depTaskTitle = resolveTaskTitle(depTaskId, response.included);
      const typeLabel = dependencyTypeLabel(dep.attributes.type_id);

      const taskDisplay = taskTitle ? `${taskTitle} (ID: ${taskId})` : `Task ${taskId}`;
      const depDisplay = depTaskTitle ? `${depTaskTitle} (ID: ${depTaskId})` : `Task ${depTaskId}`;

      return `- Dependency ID: ${dep.id}\n  ${taskDisplay} → ${typeLabel} → ${depDisplay}\n  Type ID: ${dep.attributes.type_id}`;
    }).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${response.data.length} dependency(ies):\n\n${depsText}`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export async function getTaskDependencyTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getTaskDependencySchema.parse(args);
    const response = await client.getTaskDependency(params.dependency_id);
    const dep = response.data;

    const taskId = dep.relationships?.task?.data?.id;
    const depTaskId = dep.relationships?.dependent_task?.data?.id;
    const taskTitle = resolveTaskTitle(taskId, response.included);
    const depTaskTitle = resolveTaskTitle(depTaskId, response.included);
    const typeLabel = dependencyTypeLabel(dep.attributes.type_id);

    let text = `Dependency ID: ${dep.id}\n`;
    text += `Type: ${typeLabel} (type_id: ${dep.attributes.type_id})\n`;
    text += `Task: ${taskTitle || 'Unknown'} (ID: ${taskId})\n`;
    text += `Dependent task: ${depTaskTitle || 'Unknown'} (ID: ${depTaskId})\n`;
    if (dep.attributes.created_at) text += `Created at: ${dep.attributes.created_at}`;

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export async function createTaskDependencyTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = createTaskDependencySchema.parse(args);

    const response = await client.createTaskDependency({
      data: {
        type: 'task_dependencies',
        attributes: {
          task_id: params.task_id,
          dependent_task_id: params.dependent_task_id,
          type_id: params.type_id.toString(),
        },
      },
    });

    const dep = response.data;
    const typeLabel = dependencyTypeLabel(dep.attributes.type_id);

    let text = `Task dependency created successfully!\n`;
    text += `Dependency ID: ${dep.id}\n`;
    text += `Type: ${typeLabel}\n`;
    text += `Task ${params.task_id} → ${typeLabel} → Task ${params.dependent_task_id}`;

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export async function deleteTaskDependencyTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = deleteTaskDependencySchema.parse(args);
    await client.deleteTaskDependency(params.dependency_id);

    return {
      content: [{
        type: 'text',
        text: `Task dependency ${params.dependency_id} deleted successfully.`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

// ---- Definitions ----

export const listTaskDependenciesDefinition = {
  name: 'list_task_dependencies',
  description: 'List task dependencies (blockers/related tasks). Filter by task_id to see what a task blocks, or dependent_task_id to see what blocks a task.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'Filter by source task ID — shows tasks that this task blocks',
      },
      dependent_task_id: {
        type: 'string',
        description: 'Filter by dependent task ID — shows tasks that block this task',
      },
      limit: {
        type: 'number',
        description: 'Number of results to return (1-200, default: 50)',
      },
    },
  },
};

export const getTaskDependencyDefinition = {
  name: 'get_task_dependency',
  description: 'Get details of a specific task dependency by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      dependency_id: {
        type: 'string',
        description: 'ID of the task dependency to retrieve (required)',
      },
    },
    required: ['dependency_id'],
  },
};

export const createTaskDependencyDefinition = {
  name: 'create_task_dependency',
  description: 'Create a dependency between two tasks. Use type_id 1 for "blocks" (task must finish before dependent_task can start), 2 for "is blocked by", 3 for "related to".',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the source task (the blocker) — required',
      },
      dependent_task_id: {
        type: 'string',
        description: 'ID of the dependent task (the blocked task) — required',
      },
      type_id: {
        type: 'number',
        description: 'Dependency type: 1 = blocks (finish to start), 2 = is blocked by, 3 = related to. Default: 1',
        default: 1,
      },
    },
    required: ['task_id', 'dependent_task_id'],
  },
};

export const deleteTaskDependencyDefinition = {
  name: 'delete_task_dependency',
  description: 'Delete a task dependency by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      dependency_id: {
        type: 'string',
        description: 'ID of the task dependency to delete (required)',
      },
    },
    required: ['dependency_id'],
  },
};
