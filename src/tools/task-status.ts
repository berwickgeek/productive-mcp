import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveTaskUpdate, ProductiveIncludedResource } from '../api/types.js';
import { getConfig } from '../config/index.js';

const updateTaskStatusSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  workflow_status_id: z.string().optional().describe('Exact workflow status ID (use if known)'),
  status_name: z.string().optional().describe('Status name to match, e.g. "In Progress", "Done", "QA Review"'),
});

/**
 * Resolves the workflow for a task by going through its project,
 * then lists all statuses in that workflow (including custom ones).
 * Path: task → project (include=workflow) → workflow_id → list statuses
 */
async function resolveWorkflowStatuses(
  taskId: string
): Promise<{ workflowId: string; statuses: Array<{ id: string; name: string; categoryId: number }> }> {
  const cfg = getConfig();
  const headers = {
    'X-Auth-Token': cfg.PRODUCTIVE_API_TOKEN,
    'X-Organization-Id': cfg.PRODUCTIVE_ORG_ID,
    'Content-Type': 'application/vnd.api+json',
  };

  // Step 1: Get the task with project included to find its project ID
  const taskRes = await fetch(
    `${cfg.PRODUCTIVE_API_BASE_URL}tasks/${taskId}?include=project`,
    { headers }
  );
  if (!taskRes.ok) {
    throw new Error(`Failed to fetch task ${taskId}: ${taskRes.status}`);
  }
  const taskData = await taskRes.json();
  const projectId = taskData.data?.relationships?.project?.data?.id;
  if (!projectId) {
    throw new Error('Task has no project assigned');
  }

  // Step 2: Get the project with workflow included to find workflow_id
  const projRes = await fetch(
    `${cfg.PRODUCTIVE_API_BASE_URL}projects/${projectId}?include=workflow`,
    { headers }
  );
  if (!projRes.ok) {
    throw new Error(`Failed to fetch project ${projectId}: ${projRes.status}`);
  }
  const projData = await projRes.json();
  const workflowId = projData.data?.relationships?.workflow?.data?.id;
  if (!workflowId) {
    throw new Error('Project has no workflow configured');
  }

  // Step 3: List all statuses in this workflow
  const statusRes = await fetch(
    `${cfg.PRODUCTIVE_API_BASE_URL}workflow_statuses?filter[workflow_id]=${workflowId}&page[size]=200`,
    { headers }
  );
  if (!statusRes.ok) {
    throw new Error(`Failed to fetch workflow statuses: ${statusRes.status}`);
  }
  const statusData = await statusRes.json();

  const statuses = statusData.data.map((s: ProductiveIncludedResource) => ({
    id: s.id,
    name: s.attributes.name as string,
    categoryId: s.attributes.category_id as number,
  }));

  return { workflowId, statuses };
}

function categoryLabel(categoryId: number): string {
  if (categoryId === 1) return 'Not Started';
  if (categoryId === 2) return 'Started';
  if (categoryId === 3) return 'Closed';
  return `Category ${categoryId}`;
}

function formatStatusList(statuses: Array<{ id: string; name: string; categoryId: number }>): string {
  return statuses
    .map(s => `  • "${s.name}" (ID: ${s.id}) — ${categoryLabel(s.categoryId)}`)
    .join('\n');
}

export async function updateTaskStatusTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updateTaskStatusSchema.parse(args);

    if (!params.workflow_status_id && !params.status_name) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Either workflow_status_id or status_name must be provided'
      );
    }

    let resolvedStatusId = params.workflow_status_id;
    let resolvedStatusName = '';

    // If status_name provided, resolve it to an ID
    if (params.status_name && !resolvedStatusId) {
      const { statuses } = await resolveWorkflowStatuses(params.task_id);
      const needle = params.status_name.toLowerCase().trim();

      // 1. Exact match (case-insensitive)
      let matches = statuses.filter(s => s.name.toLowerCase() === needle);

      // 2. Starts-with match
      if (matches.length === 0) {
        matches = statuses.filter(s => s.name.toLowerCase().startsWith(needle));
      }

      // 3. Contains match
      if (matches.length === 0) {
        matches = statuses.filter(s => s.name.toLowerCase().includes(needle));
      }

      if (matches.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No workflow status matching "${params.status_name}" found.\n\nAvailable statuses:\n${formatStatusList(statuses)}`,
          }],
        };
      }

      if (matches.length > 1) {
        // Check if one is an exact match among the multiple
        const exact = matches.filter(s => s.name.toLowerCase() === needle);
        if (exact.length === 1) {
          matches = exact;
        } else {
          return {
            content: [{
              type: 'text',
              text: `Multiple statuses match "${params.status_name}":\n${formatStatusList(matches)}\n\nPlease be more specific, or use the workflow_status_id directly.`,
            }],
          };
        }
      }

      resolvedStatusId = matches[0].id;
      resolvedStatusName = matches[0].name;
    }

    // Apply the status
    const taskUpdate: ProductiveTaskUpdate = {
      data: {
        type: 'tasks',
        id: params.task_id,
        relationships: {
          workflow_status: {
            data: {
              id: resolvedStatusId!,
              type: 'workflow_statuses',
            },
          },
        },
      },
    };

    const response = await client.updateTask(params.task_id, taskUpdate);

    let text = `Task status updated successfully!\n`;
    text += `Task: ${response.data.attributes.title} (ID: ${response.data.id})\n`;
    if (resolvedStatusName) {
      text += `Status: ${resolvedStatusName} (ID: ${resolvedStatusId})`;
    } else {
      text += `Workflow Status ID: ${resolvedStatusId}`;
    }

    if (response.data.attributes.closed !== undefined) {
      text += `\nTask is now: ${response.data.attributes.closed ? 'closed' : 'open'}`;
    }

    if (response.data.attributes.updated_at) {
      text += `\nUpdated at: ${response.data.attributes.updated_at}`;
    }

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

    if (error instanceof McpError) throw error;

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const updateTaskStatusDefinition = {
  name: 'update_task_status',
  description: 'Update the status of a task in Productive.io. You can provide a status_name (e.g. "In Progress", "Done", "QA Review") and it will automatically resolve to the correct workflow status for that task. Supports custom workflow statuses. Falls back to workflow_status_id if provided directly.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to update (required)',
      },
      status_name: {
        type: 'string',
        description: 'Name of the status to set (e.g. "In Progress", "Done", "To Do"). Case-insensitive, supports partial matching. If ambiguous, returns available options.',
      },
      workflow_status_id: {
        type: 'string',
        description: 'Exact workflow status ID (optional — use status_name instead for convenience)',
      },
    },
    required: ['task_id'],
  },
};
