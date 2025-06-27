import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listProjectsSchema = z.object({
  status: z.enum(['active', 'archived']).optional(),
  company_id: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

export async function listProjectsTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listProjectsSchema.parse(args);
    
    const response = await client.listProjects({
      status: params.status,
      company_id: params.company_id,
      limit: params.limit,
    });
    
    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No projects found matching the criteria.',
        }],
      };
    }
    
    const projectsText = response.data.map(project => {
      const companyId = project.relationships?.company?.data?.id;
      return `• ${project.attributes.name} (ID: ${project.id})
  Status: ${project.attributes.status}
  ${companyId ? `Company ID: ${companyId}` : ''}
  ${project.attributes.description ? `Description: ${project.attributes.description}` : 'No description'}`;
    }).join('\n\n');
    
    const summary = `Found ${response.data.length} project${response.data.length !== 1 ? 's' : ''}${response.meta?.total_count ? ` (showing ${response.data.length} of ${response.meta.total_count})` : ''}:\n\n${projectsText}`;
    
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

export const listProjectsDefinition = {
  name: 'list_projects',
  description: 'Get a list of projects from Productive.io',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'archived'],
        description: 'Filter by project status',
      },
      company_id: {
        type: 'string',
        description: 'Filter projects by company ID',
      },
      limit: {
        type: 'number',
        description: 'Number of projects to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
  },
};