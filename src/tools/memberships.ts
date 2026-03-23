import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

type ToolResult = { content: Array<{ type: string; text: string }> };

const listMembershipsSchema = z.object({
  project_id: z.string().optional(),
  person_id: z.string().optional(),
  limit: z.number().min(1).max(200).default(50).optional(),
  page: z.number().min(1).optional(),
});

function handleError(error: unknown): never {
  if (error instanceof z.ZodError) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
  }
  throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
}

export async function listMembershipsTool(client: ProductiveAPIClient, args: unknown): Promise<ToolResult> {
  try {
    const params = listMembershipsSchema.parse(args || {});

    const response = await client.listMemberships({
      project_id: params.project_id,
      person_id: params.person_id,
      limit: params.limit,
      page: params.page,
    });

    if (!response.data || response.data.length === 0) {
      const context = params.project_id
        ? `project ${params.project_id}`
        : params.person_id
        ? `person ${params.person_id}`
        : 'the given criteria';
      return { content: [{ type: 'text', text: `No memberships found for ${context}.` }] };
    }

    const membershipsText = response.data.map(membership => {
      const personId = membership.relationships?.person?.data?.id;
      const projectId = membership.relationships?.project?.data?.id;
      return `• Membership (ID: ${membership.id})
  ${personId ? `Person ID: ${personId}` : ''}
  ${projectId ? `Project ID: ${projectId}` : ''}
  ${membership.attributes.role !== undefined ? `Role: ${membership.attributes.role}` : ''}
  Created: ${membership.attributes.created_at}`.trim();
    }).join('\n\n');

    const total = response.meta?.total_count;
    const context = params.project_id ? ` for project ${params.project_id}` : params.person_id ? ` for person ${params.person_id}` : '';
    const summary = `Found ${response.data.length} membership${response.data.length !== 1 ? 's' : ''}${context}${total ? ` (showing ${response.data.length} of ${total})` : ''}:\n\n${membershipsText}`;

    return { content: [{ type: 'text', text: summary }] };
  } catch (error) {
    handleError(error);
  }
}

export const listMembershipsDefinition = {
  name: 'list_memberships',
  description: 'List project memberships in Productive.io. Use to see which people are members of a project, or which projects a person belongs to. Provide project_id to see all members of a project, or person_id to see all projects a person is a member of.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Filter by project ID — returns all members of this project' },
      person_id: { type: 'string', description: 'Filter by person ID — returns all projects this person is a member of' },
      limit: { type: 'number', description: 'Number of results (1-200, default: 50)', minimum: 1, maximum: 200, default: 50 },
      page: { type: 'number', description: 'Page number for pagination', minimum: 1 },
    },
  },
};
