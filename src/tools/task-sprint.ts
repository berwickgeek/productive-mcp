import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { ProductiveTask } from '../api/types.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Sprint mapping: S01-S10 to their corresponding IDs
const SPRINT_MAPPING: Record<string, string> = {
  'S01': '231231',
  'S02': '231232',
  'S03': '231233',
  'S04': '231234',
  'S05': '231235',
  'S06': '231236',
  'S07': '231237',
  'S08': '231238',
  'S09': '231239',
  'S10': '231240'
};

// Custom field ID for Sprint
const SPRINT_CUSTOM_FIELD_ID = '69063';

// Schema for sprint values - can be single string or array
const sprintValueSchema = z.union([
  z.string(),
  z.array(z.string())
]);

const updateTaskSprintSchema = z.object({
  task_id: z.string().describe('ID of the task to update'),
  sprints: sprintValueSchema.describe('Sprint number(s) like "S03" or ["S03", "S04"]. Use empty array [] or null to remove all sprints')
});

export async function updateTaskSprint(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const { task_id, sprints } = updateTaskSprintSchema.parse(args);
    
    // Handle null or empty sprints
    if (sprints === null || (Array.isArray(sprints) && sprints.length === 0)) {
      // Remove all sprints
      await client.updateTask(task_id, {
        data: {
          type: 'tasks',
          id: task_id,
          attributes: {
            custom_fields: {
              [SPRINT_CUSTOM_FIELD_ID]: []
            }
          }
        }
      });
      
      return {
        content: [{
          type: 'text',
          text: `✅ Removed all sprints from task ${task_id}`
        }]
      };
    }
    
    // Normalize to array
    const sprintArray = Array.isArray(sprints) ? sprints : [sprints];
    
    // Map sprint numbers to IDs
    const sprintIds: string[] = [];
    for (const sprint of sprintArray) {
      const sprintUpper = sprint.toUpperCase();
      const sprintId = SPRINT_MAPPING[sprintUpper];
      
      if (!sprintId) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid sprint number: ${sprint}. Valid sprints are S01-S10`
        );
      }
      
      sprintIds.push(sprintId);
    }
    
    // Update the task's sprint custom field
    const response = await client.updateTask(task_id, {
      data: {
        type: 'tasks',
        id: task_id,
        attributes: {
          custom_fields: {
            [SPRINT_CUSTOM_FIELD_ID]: sprintIds
          }
        }
      }
    });
    const updatedTask = response.data;
    
    // Get the updated sprint values for display
    const updatedSprints = updatedTask.attributes.custom_fields?.[SPRINT_CUSTOM_FIELD_ID] || [];
    const sprintNames = updatedSprints.map((id: string) => {
      const entry = Object.entries(SPRINT_MAPPING).find(([_, value]) => value === id);
      return entry ? entry[0] : id;
    });
    
    return {
      content: [{
        type: 'text',
        text: `✅ Updated task ${task_id} sprints to: ${sprintNames.join(', ')}`
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

export const updateTaskSprintTool = {
  name: 'update_task_sprint',
  description: 'Update the sprint(s) assigned to a task. Sprints are tracked using a custom field.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to update'
      },
      sprints: {
        oneOf: [
          {
            type: 'string',
            description: 'Single sprint number like "S03"'
          },
          {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Array of sprint numbers like ["S03", "S04"]'
          },
          {
            type: 'null',
            description: 'Use null to remove all sprints'
          }
        ],
        description: 'Sprint number(s) like "S03" or ["S03", "S04"]. Use empty array [] or null to remove all sprints'
      }
    },
    required: ['task_id', 'sprints']
  }
};