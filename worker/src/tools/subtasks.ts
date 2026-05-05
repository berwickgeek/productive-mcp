import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveIncludedResource } from '../api/types.js';

function resolvePersonName(personId: string | undefined, included?: ProductiveIncludedResource[]): string | undefined {
  if (!personId || !included) return undefined;
  const person = included.find(item => item.type === 'people' && item.id === personId);
  if (!person) return undefined;
  const first = person.attributes.first_name || '';
  const last = person.attributes.last_name || '';
  return `${first} ${last}`.trim() || undefined;
}

function resolveWorkflowStatus(task: { relationships?: Record<string, any> }, included?: ProductiveIncludedResource[]): string | undefined {
  const statusId = task.relationships?.workflow_status?.data?.id;
  if (!statusId || !included) return undefined;
  const status = included.find(item => item.type === 'workflow_statuses' && item.id === statusId);
  return status?.attributes?.name || undefined;
}

const listSubtasksSchema = z.object({
  parent_task_id: z.string().min(1, 'Parent task ID is required'),
  limit: z.number().min(1).max(200).default(30).optional(),
  page: z.number().min(1).default(1).optional(),
});

export async function listSubtasksTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listSubtasksSchema.parse(args || {});
    const config = client.getConfig();

    const limit = params.limit ?? 30;
    const page = params.page ?? 1;
    const url = `${config.PRODUCTIVE_API_BASE_URL}tasks?filter[parent_task_id]=${params.parent_task_id}&include=assignee,workflow_status&page[size]=${limit}&page[number]=${page}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Auth-Token': config.PRODUCTIVE_API_TOKEN,
        'X-Organization-Id': config.PRODUCTIVE_ORG_ID,
        'Content-Type': 'application/vnd.api+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list subtasks: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ id: string; attributes: any; relationships?: Record<string, any> }>;
      included?: ProductiveIncludedResource[];
      meta?: { total_count?: number };
    };

    if (!data || !data.data || data.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No subtasks found for parent task ${params.parent_task_id}.`,
        }],
      };
    }

    const items = data.data;
    const tasksText = items.filter((task: any) => task && task.attributes).map((task: any) => {
      const projectId = task.relationships?.project?.data?.id;
      const assigneeId = task.relationships?.assignee?.data?.id;
      const assigneeName = resolvePersonName(assigneeId, data.included);
      const workflowStatusName = resolveWorkflowStatus(task, data.included);
      const fallbackStatus = task.attributes.status === 1 ? 'open' : task.attributes.status === 2 ? 'closed' : `status ${task.attributes.status}`;
      const statusText = workflowStatusName || fallbackStatus;
      const assigneeDisplay = assigneeName
        ? `Assignee: ${assigneeName} (ID: ${assigneeId})`
        : assigneeId ? `Assignee ID: ${assigneeId}` : 'Unassigned';
      return `• ${task.attributes.title} (ID: ${task.id})
  Status: ${statusText}
  ${task.attributes.due_date ? `Due: ${task.attributes.due_date}` : 'No due date'}
  ${projectId ? `Project ID: ${projectId}` : ''}
  ${assigneeDisplay}
  ${task.attributes.description ? `Description: ${task.attributes.description}` : ''}`;
    }).join('\n\n');

    const total = data.meta?.total_count;
    const summary = `Found ${items.length} subtask${items.length !== 1 ? 's' : ''} for parent task ${params.parent_task_id}${total ? ` (showing ${items.length} of ${total})` : ''}:\n\n${tasksText}`;

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
        `Invalid parameters: ${error.issues.map((e: z.ZodIssue) => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const listSubtasksDefinition = {
  name: 'list_subtasks',
  description: 'List subtasks of a parent task in Productive.io',
  inputSchema: {
    type: 'object',
    properties: {
      parent_task_id: {
        type: 'string',
        description: 'The ID of the parent task (required)',
      },
      limit: {
        type: 'number',
        description: 'Number of subtasks to return (1-200, default: 30)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default: 1)',
        minimum: 1,
        default: 1,
      },
    },
    required: ['parent_task_id'],
  },
};

const createSubtaskSchema = z.object({
  parent_task_id: z.string().min(1, 'Parent task ID is required'),
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional(),
  project_id: z.string().optional(),
  task_list_id: z.string().optional(),
  assignee_id: z.string().optional(),
  due_date: z.string().optional(),
});

export async function createSubtaskTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = createSubtaskSchema.parse(args || {});

    const taskData: any = {
      data: {
        type: 'tasks' as const,
        attributes: {
          title: params.title,
          description: params.description,
          due_date: params.due_date,
          status: 1,
        },
        relationships: {
          parent_task: {
            data: {
              type: 'tasks',
              id: params.parent_task_id,
            },
          },
        },
      },
    };

    if (params.project_id) {
      taskData.data.relationships.project = {
        data: { id: params.project_id, type: 'projects' as const },
      };
    }

    if (params.task_list_id) {
      taskData.data.relationships.task_list = {
        data: { id: params.task_list_id, type: 'task_lists' as const },
      };
    }

    if (params.assignee_id) {
      taskData.data.relationships.assignee = {
        data: { id: params.assignee_id, type: 'people' as const },
      };
    }

    const response = await client.createTask(taskData);

    let text = `Subtask created successfully!\n`;
    text += `Title: ${response.data.attributes.title} (ID: ${response.data.id})\n`;
    text += `Parent Task ID: ${params.parent_task_id}\n`;
    if (response.data.attributes.description) {
      text += `Description: ${response.data.attributes.description}\n`;
    }
    const statusText = response.data.attributes.status === 1 ? 'open' : 'closed';
    text += `Status: ${statusText}\n`;
    if (response.data.attributes.due_date) {
      text += `Due date: ${response.data.attributes.due_date}\n`;
    }
    if (params.project_id) {
      text += `Project ID: ${params.project_id}\n`;
    }
    if (params.task_list_id) {
      text += `Task List ID: ${params.task_list_id}\n`;
    }
    if (params.assignee_id) {
      text += `Assignee ID: ${params.assignee_id}\n`;
    }
    if (response.data.attributes.created_at) {
      text += `Created at: ${response.data.attributes.created_at}\n`;
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
        `Invalid parameters: ${error.issues.map((e: z.ZodIssue) => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const createSubtaskDefinition = {
  name: 'create_subtask',
  description: 'Create a subtask under a parent task in Productive.io',
  inputSchema: {
    type: 'object',
    properties: {
      parent_task_id: {
        type: 'string',
        description: 'The ID of the parent task (required)',
      },
      title: {
        type: 'string',
        description: 'Subtask title (required)',
      },
      description: {
        type: 'string',
        description: 'Subtask description',
      },
      project_id: {
        type: 'string',
        description: 'ID of the project to add the subtask to',
      },
      task_list_id: {
        type: 'string',
        description: 'ID of the task list to add the subtask to',
      },
      assignee_id: {
        type: 'string',
        description: 'ID of the person to assign the subtask to',
      },
      due_date: {
        type: 'string',
        description: 'Due date in YYYY-MM-DD format',
      },
    },
    required: ['parent_task_id', 'title'],
  },
};
