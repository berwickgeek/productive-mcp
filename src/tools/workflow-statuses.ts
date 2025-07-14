import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listWorkflowStatusesSchema = z.object({
  workflow_id: z.string().optional(),
  category_id: z.number().int().min(1).max(3).optional(),
  limit: z.number().min(1).max(200).default(50).optional(),
});

export async function listWorkflowStatusesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listWorkflowStatusesSchema.parse(args);
    
    const response = await client.listWorkflowStatuses({
      workflow_id: params.workflow_id,
      category_id: params.category_id,
      limit: params.limit,
    });
    
    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No workflow statuses found.',
        }],
      };
    }
    
    const statusesText = response.data.map(status => {
      const categoryName = status.attributes.category_id === 1 ? 'Not Started' :
                          status.attributes.category_id === 2 ? 'Started' :
                          status.attributes.category_id === 3 ? 'Closed' : 
                          `Category ${status.attributes.category_id}`;
      
      return `• ${status.attributes.name} (ID: ${status.id})
  Category: ${categoryName} (${status.attributes.category_id})
  Workflow ID: ${status.relationships?.workflow?.data?.id || 'N/A'}
  Position: ${status.attributes.position || 'N/A'}`;
    }).join('\n\n');
    
    const summary = `Found ${response.data.length} workflow status${response.data.length !== 1 ? 'es' : ''}:\n\n${statusesText}`;
    
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

export const listWorkflowStatusesDefinition = {
  name: 'list_workflow_statuses',
  description: 'List workflow statuses available in Productive.io. These are used to set task status (Not Started=1, Started=2, Closed=3).',
  inputSchema: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'Filter by workflow ID',
      },
      category_id: {
        type: 'number',
        description: 'Filter by category: 1=Not Started, 2=Started, 3=Closed',
        minimum: 1,
        maximum: 3,
      },
      limit: {
        type: 'number',
        description: 'Number of statuses to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 50,
      },
    },
  },
};